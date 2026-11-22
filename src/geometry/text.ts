import { DIAGRAM_FONT } from './page';

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  ctx = document.createElement('canvas').getContext('2d');
  return ctx;
}

export function measure(text: string, size: number, bold = false): number {
  const key = `${size}|${bold ? 1 : 0}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const c = getCtx();
  let w: number;
  if (c) {
    c.font = `${bold ? 'bold ' : ''}${size}px ${DIAGRAM_FONT}, Arial, sans-serif`;
    w = c.measureText(text).width;
  } else {
    w = text.length * size * 0.55;
  }
  cache.set(key, w);
  return w;
}

export function clearMeasureCache(): void {
  cache.clear();
}

/** Перенесення по словах без розбиття слів; null — якщо якесь слово ширше за рядок. */
export function wrapWords(text: string, maxWidth: number, size: number, bold = false): string[] | null {
  for (const word of (text || '').split(/\s+/)) if (word && measure(word, size, bold) > maxWidth) return null;
  return wrapText(text, maxWidth, size, bold);
}

/** Перенесення тексту по словах у межах maxWidth (довгі слова розбиваються). */
export function wrapText(text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of (text || '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // слово ширше за рядок — розбиваємо посимвольно
      while (measure(word, size, bold) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut) + '-', size, bold) > maxWidth) cut--;
        lines.push(word.slice(0, cut) + '-');
        word = word.slice(cut);
      }
      line = word;
    }
    if (line) lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
