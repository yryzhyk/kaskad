import type { Report, ReportSection } from '../model/reports';

/** Таблиця для експорту: лише колонки exportColumns (якщо задані), із заголовками як у методичці. */
export function exportView(s: ReportSection): { columns: string[]; rows: string[][]; numeric: number[] } {
  if (!s.exportColumns) return { columns: s.columns, rows: s.rows, numeric: s.numeric ?? [] };
  const idx = s.exportColumns.map((c) => c.index);
  return {
    columns: s.exportColumns.map((c) => c.title),
    rows: s.rows.map((r) => idx.map((i) => r[i] ?? '')),
    numeric: idx.flatMap((i, k) => (s.numeric?.includes(i) ? [k] : [])),
  };
}

function csvCell(v: string): string {
  const s = (v ?? '').replace(/^\s+/, (m) => m); // зберігаємо відступи
  return /[";\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (роздільник «;», UTF-8 з BOM — коректно відкривається в Excel з українською локаллю). */
export function reportToCsv(r: Report): string {
  const lines: string[] = [csvCell(r.title), csvCell(r.scope), ''];
  for (const sec of r.sections) {
    const s = { ...exportView(sec), caption: sec.caption };
    if (s.caption) lines.push(csvCell(s.caption));
    lines.push(s.columns.map(csvCell).join(';'));
    for (const row of s.rows) lines.push(row.map(csvCell).join(';'));
    lines.push('');
  }
  return '﻿' + lines.join('\r\n');
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/** HTML-таблиці для вставки у Word. */
export function reportToHtml(r: Report): string {
  const cell = 'border:1px solid #000;padding:3pt 5pt;vertical-align:top;font-family:"Times New Roman",serif;font-size:12pt;';
  const parts = [`<p style="font-family:'Times New Roman',serif;font-size:14pt;font-weight:bold">${esc(r.title)}</p>`];
  parts.push(`<p style="font-family:'Times New Roman',serif;font-size:12pt">${esc(r.scope)}</p>`);
  for (const sec of r.sections) {
    const s = { ...exportView(sec), caption: sec.caption };
    if (s.caption) parts.push(`<p style="font-family:'Times New Roman',serif;font-size:12pt;font-style:italic">${esc(s.caption)}</p>`);
    parts.push('<table style="border-collapse:collapse;width:100%" border="1" cellspacing="0" cellpadding="4">');
    parts.push('<tr>' + s.columns.map((c) => `<th style="${cell}font-weight:bold;background:#f2f2f2">${esc(c)}</th>`).join('') + '</tr>');
    for (const row of s.rows) {
      parts.push(
        '<tr>' +
          row
            .map((c, i) => {
              const indent = (c.match(/^ */)?.[0].length ?? 0) / 4;
              const align = s.numeric.includes(i) ? 'text-align:right;' : '';
              const pad = indent ? `padding-left:${5 + indent * 12}pt;` : '';
              return `<td style="${cell}${align}${pad}">${esc(c.trim())}</td>`;
            })
            .join('') +
          '</tr>',
      );
    }
    parts.push('</table><p></p>');
  }
  return parts.join('');
}

export function reportToTsv(r: Report): string {
  const lines: string[] = [r.title, r.scope, ''];
  for (const sec of r.sections) {
    const s = { ...exportView(sec), caption: sec.caption };
    if (s.caption) lines.push(s.caption);
    lines.push(s.columns.join('\t'));
    for (const row of s.rows) lines.push(row.map((c) => c.replace(/[\t\n]/g, ' ')).join('\t'));
    lines.push('');
  }
  return lines.join('\n');
}

export async function copyReport(r: Report): Promise<boolean> {
  const html = reportToHtml(r);
  const text = reportToTsv(r);
  try {
    if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* спробуємо запасний спосіб */
  }
  // Запасний спосіб: виділення тимчасового елемента
  const div = document.createElement('div');
  div.contentEditable = 'true';
  div.style.position = 'fixed';
  div.style.left = '-10000px';
  div.innerHTML = html;
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  div.remove();
  return ok;
}
