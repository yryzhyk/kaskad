import { AREA, BOX_H, BOX_W, PAGE_W, UOB_H, UOB_W } from '../geometry/page';
import type { AbcData, Box, Id, Idef0Diagram, Idef3Diagram, Model } from './types';

let idCounter = 0;
export function newId(prefix: string): Id {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

export function emptyAbc(): AbcData {
  return { costs: {}, duration: 0, frequency: 1 };
}

export function createBox(name: string, x: number, y: number, w = BOX_W, h = BOX_H): Box {
  return { id: newId('b'), name, definition: '', x, y, w, h, abc: emptyAbc() };
}

export function createModel(name = 'Нова модель'): Model {
  const rootId = newId('d');
  const w = 220;
  const h = 120;
  const box = createBox(name, Math.round((PAGE_W - w) / 2), Math.round((AREA.top + AREA.bottom - h) / 2), w, h);
  const root: Idef0Diagram = { id: rootId, kind: 'idef0', parentBoxId: null, boxes: [box], arrows: [] };
  return {
    format: 'kaskad',
    version: 1,
    name,
    author: '',
    purpose: '',
    viewpoint: '',
    definition: '',
    createdAt: new Date().toISOString(),
    abc: { currency: 'грн', timeUnit: 'години', showCost: false },
    costCenters: [],
    diagrams: { [rootId]: root },
    rootDiagramId: rootId,
    counters: { uob: 0, junction: 0 },
  };
}

/** Розташування блоків «сходинками» з лівого верхнього кута в правий нижній. */
export function staircase(n: number, w = BOX_W, h = BOX_H): { x: number; y: number }[] {
  const padX = 90;
  const padY = 70;
  const left = AREA.left + padX;
  const top = AREA.top + padY;
  const availW = AREA.right - padX - w - left;
  const availH = AREA.bottom - padY - h - top;
  const dx = n > 1 ? Math.min(210, availW / (n - 1)) : 0;
  const dy = n > 1 ? Math.min(130, availH / (n - 1)) : 0;
  const spanW = dx * (n - 1) + w;
  const spanH = dy * (n - 1) + h;
  const x0 = left + (AREA.right - padX - left - spanW) / 2;
  const y0 = top + (AREA.bottom - padY - top - spanH) / 2;
  const res: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) res.push({ x: Math.round(x0 + dx * i), y: Math.round(y0 + dy * i) });
  return res;
}

export function createIdef0Child(parentBoxId: Id, count: number): Idef0Diagram {
  const pos = staircase(count);
  return {
    id: newId('d'),
    kind: 'idef0',
    parentBoxId,
    boxes: pos.map((p, i) => createBox(`Робота ${i + 1}`, p.x, p.y)),
    arrows: [],
  };
}

/** Розташування UOB у ряд зліва направо. */
export function uobRow(n: number): { x: number; y: number }[] {
  const gap = 70;
  const span = n * UOB_W + (n - 1) * gap;
  const step = span > AREA.right - AREA.left - 80 ? (AREA.right - AREA.left - 80 - UOB_W) / Math.max(1, n - 1) : UOB_W + gap;
  const total = step * (n - 1) + UOB_W;
  const x0 = AREA.left + (AREA.right - AREA.left - total) / 2;
  const y = Math.round((AREA.top + AREA.bottom - UOB_H) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(x0 + step * i), y }));
}

export function createIdef3Child(model: Model, parentBoxId: Id, count: number): Idef3Diagram {
  const pos = uobRow(count);
  const boxes = pos.map((p, i) => {
    model.counters.uob += 1;
    const b = createBox(`Дія ${i + 1}`, p.x, p.y, UOB_W, UOB_H);
    b.num = model.counters.uob;
    return b;
  });
  return { id: newId('d'), kind: 'idef3', parentBoxId, boxes, junctions: [], referents: [], links: [] };
}
