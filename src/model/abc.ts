import type { Box, Id, Model } from './types';
import { findBox } from './queries';

export interface AbcResult {
  costs: Record<Id, number>;
  total: number;
  duration: number;
  frequency: number;
  /** true — значення обчислено з дочірньої діаграми. */
  computed: boolean;
}

const cache = new WeakMap<Model, Map<Id, AbcResult>>();

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * Вартість і тривалість роботи.
 * Для роботи без декомпозиції — введені значення.
 * Для декомпозованої (IDEF0 або IDEF3) — сума (значення дочірньої × частота дочірньої).
 */
export function abcOf(model: Model, box: Box): AbcResult {
  let m = cache.get(model);
  if (!m) {
    m = new Map();
    cache.set(model, m);
  }
  const hit = m.get(box.id);
  if (hit) return hit;
  m.set(box.id, { costs: {}, total: 0, duration: 0, frequency: 1, computed: false }); // захист від циклів
  const frequency = num(box.abc?.frequency ?? 1);
  const child = box.childDiagramId ? model.diagrams[box.childDiagramId] : undefined;
  let res: AbcResult;
  if (child) {
    const costs: Record<Id, number> = {};
    for (const cc of model.costCenters) costs[cc.id] = 0;
    let duration = 0;
    for (const cb of child.boxes) {
      const r = abcOf(model, cb);
      for (const cc of model.costCenters) costs[cc.id] += (r.costs[cc.id] ?? 0) * r.frequency;
      duration += r.duration * r.frequency;
    }
    for (const k of Object.keys(costs)) costs[k] = round(costs[k]);
    res = { costs, total: round(sum(costs)), duration: round(duration), frequency, computed: true };
  } else {
    const costs: Record<Id, number> = {};
    for (const cc of model.costCenters) costs[cc.id] = num(box.abc?.costs?.[cc.id] ?? 0);
    res = { costs, total: round(sum(costs)), duration: num(box.abc?.duration ?? 0), frequency, computed: false };
  }
  m.set(box.id, res);
  return res;
}

export function abcOfId(model: Model, boxId: Id): AbcResult | undefined {
  const loc = findBox(model, boxId);
  return loc ? abcOf(model, loc.box) : undefined;
}

function sum(o: Record<string, number>): number {
  return Object.values(o).reduce((a, b) => a + b, 0);
}

export function formatNumber(v: number, digits = 2): string {
  return v.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: digits }).replace(/ /g, ' ');
}

export function formatMoney(model: Model, v: number): string {
  return `${formatNumber(v)} ${model.abc.currency}`;
}
