import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { getLayout } from '../geometry/layout';
import { PAGE_H, PAGE_W } from '../geometry/page';
import { diagramLabel, diagramOrder, diagramPageNumber } from '../model/queries';
import type { Id, Model } from '../model/types';
import { DiagramSvg } from '../render/DiagramSvg';
import { FONT_FACE_CSS } from '../render/fonts';
import { downloadBlob, safeFileName } from './download';
import { makeZip } from './zip';

/** Масштаб експорту: 1120 px × 3 = 3360 px по ширині (≈ 300 dpi для аркуша A4). */
export const EXPORT_SCALE = 3;

export function diagramSvgString(model: Model, diagramId: Id, scale = 1): string {
  const layout = getLayout(model, diagramId);
  if (!layout) throw new Error('Діаграму не знайдено');
  const markup = renderToStaticMarkup(createElement(DiagramSvg, { layout, exportMode: true, scale, fontCss: FONT_FACE_CSS }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

export async function svgToPngBlob(svg: string, scale: number): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Не вдалося відобразити SVG'));
      img.src = url;
    });
    // даємо браузеру час застосувати вбудований шрифт
    await new Promise((r) => setTimeout(r, 30));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(PAGE_W * scale);
    canvas.height = Math.round(PAGE_H * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function diagramPngBlob(model: Model, diagramId: Id, scale = EXPORT_SCALE): Promise<Blob> {
  return svgToPngBlob(diagramSvgString(model, diagramId, scale), scale);
}

export function diagramFileName(model: Model, diagramId: Id, ext: string): string {
  const n = String(diagramPageNumber(model, diagramId)).padStart(2, '0');
  return `${n} ${safeFileName(diagramLabel(model, diagramId))}.${ext}`;
}

export async function exportDiagramPng(model: Model, diagramId: Id): Promise<void> {
  const blob = await diagramPngBlob(model, diagramId);
  downloadBlob(blob, diagramFileName(model, diagramId, 'png'));
}

export async function exportDiagramSvg(model: Model, diagramId: Id): Promise<void> {
  downloadBlob(new Blob([diagramSvgString(model, diagramId)], { type: 'image/svg+xml' }), diagramFileName(model, diagramId, 'svg'));
}

export async function exportAllPng(model: Model, onProgress?: (done: number, total: number) => void): Promise<void> {
  const ids = diagramOrder(model, true);
  const entries = [];
  for (let i = 0; i < ids.length; i++) {
    onProgress?.(i, ids.length);
    const blob = await diagramPngBlob(model, ids[i]);
    entries.push({ name: diagramFileName(model, ids[i], 'png'), data: new Uint8Array(await blob.arrayBuffer()) });
  }
  onProgress?.(ids.length, ids.length);
  downloadBlob(makeZip(entries), `${safeFileName(model.name)} - діаграми.zip`);
}
