import type { Bend, Point, Rect } from '../model/types';

export type Dir = 'R' | 'L' | 'U' | 'D';
export const VEC: Record<Dir, [number, number]> = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };
export const OPPOSITE: Record<Dir, Dir> = { R: 'L', L: 'R', U: 'D', D: 'U' };

const STUB = 18;

function segDir(a: Point, b: Point): Dir | null {
  if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) return null;
  if (Math.abs(a.y - b.y) < 0.01) return b.x > a.x ? 'R' : 'L';
  if (Math.abs(a.x - b.x) < 0.01) return b.y > a.y ? 'D' : 'U';
  return null;
}

/** Видаляє повторні та колінеарні точки. */
export function simplify(pts: Point[]): Point[] {
  const res: Point[] = [];
  for (const p of pts) {
    const last = res[res.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    res.push({ x: p.x, y: p.y });
  }
  let i = 1;
  while (i < res.length - 1) {
    const d1 = segDir(res[i - 1], res[i]);
    const d2 = segDir(res[i], res[i + 1]);
    if (d1 && d1 === d2) res.splice(i, 1);
    else i++;
  }
  return res;
}

function segHitsRect(a: Point, b: Point, r: Rect, inset: number): boolean {
  const x1 = r.x + inset;
  const x2 = r.x + r.w - inset;
  const y1 = r.y + inset;
  const y2 = r.y + r.h - inset;
  if (x2 <= x1 || y2 <= y1) return false;
  if (Math.abs(a.y - b.y) < 0.01) {
    const y = a.y;
    if (y <= y1 || y >= y2) return false;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    return hi > x1 && lo < x2;
  }
  const x = a.x;
  if (x <= x1 || x >= x2) return false;
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  return hi > y1 && lo < y2;
}

interface Candidate {
  pts: Point[];
  usesBend: boolean;
}

/**
 * Ортогональний маршрут від S (вихід у напрямку dS) до E (вхід у напрямку dE).
 * Обирає найкоротший шлях з мінімумом згинів, що не перетинає блоки.
 */
export function route(S: Point, dS: Dir, E: Point, dE: Dir, obstacles: Rect[], bend?: Bend): Point[] {
  const [sx, sy] = VEC[dS];
  const [ex, ey] = VEC[dE];
  const A = { x: S.x + sx * STUB, y: S.y + sy * STUB };
  const B = { x: E.x - ex * STUB, y: E.y - ey * STUB };

  const xs = new Set<number>([A.x, B.x, (A.x + B.x) / 2]);
  const ys = new Set<number>([A.y, B.y, (A.y + B.y) / 2]);
  for (const r of obstacles) {
    xs.add(r.x - STUB - 4);
    xs.add(r.x + r.w + STUB + 4);
    ys.add(r.y - STUB - 4);
    ys.add(r.y + r.h + STUB + 4);
  }
  if (bend) (bend.axis === 'x' ? xs : ys).add(bend.value);

  const cands: Candidate[] = [];
  const add = (mid: Point[], usesBend = false) => cands.push({ pts: [S, A, ...mid, B, E], usesBend });
  add([]);
  add([{ x: B.x, y: A.y }]);
  add([{ x: A.x, y: B.y }]);
  for (const m of xs) add([{ x: m, y: A.y }, { x: m, y: B.y }], bend?.axis === 'x' && m === bend.value);
  for (const m of ys) add([{ x: A.x, y: m }, { x: B.x, y: m }], bend?.axis === 'y' && m === bend.value);
  const xl = [...xs];
  const yl = [...ys];
  for (const m1 of yl)
    for (const m2 of xl) {
      add([{ x: A.x, y: m1 }, { x: m2, y: m1 }, { x: m2, y: B.y }], !!bend && ((bend.axis === 'x' && m2 === bend.value) || (bend.axis === 'y' && m1 === bend.value)));
      add([{ x: m2, y: A.y }, { x: m2, y: m1 }, { x: B.x, y: m1 }], !!bend && ((bend.axis === 'x' && m2 === bend.value) || (bend.axis === 'y' && m1 === bend.value)));
    }

  let best: Point[] | null = null;
  let bestCost = Infinity;
  for (const c of cands) {
    const pts = simplify(c.pts);
    if (pts.length < 2) continue;
    // ортогональність і відсутність розворотів на 180°
    let ok = true;
    const dirs: Dir[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = segDir(pts[i], pts[i + 1]);
      if (!d) {
        ok = false;
        break;
      }
      if (dirs.length && OPPOSITE[dirs[dirs.length - 1]] === d) {
        ok = false;
        break;
      }
      dirs.push(d);
    }
    if (!ok) continue;
    if (dirs[0] !== dS || dirs[dirs.length - 1] !== dE) continue;
    let cost = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      cost += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const inner = i > 0 && i < pts.length - 2;
      for (const r of obstacles) {
        if (segHitsRect(a, b, r, 1)) cost += 5000;
        else if (inner && segHitsRect(a, b, { x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }, 0)) cost += 60;
      }
    }
    cost += (pts.length - 2) * 25;
    if (bend && !c.usesBend) cost += 3000;
    if (cost < bestCost) {
      bestCost = cost;
      best = pts;
    }
  }
  if (!best) {
    best = simplify([S, A, { x: A.x, y: B.y }, B, E]);
  }
  return best;
}

export function pathLength(pts: Point[]): number {
  let l = 0;
  for (let i = 0; i < pts.length - 1; i++) l += Math.abs(pts[i].x - pts[i + 1].x) + Math.abs(pts[i].y - pts[i + 1].y);
  return l;
}

/** Найближча точка на ламаній та напрямок відрізка. */
export function projectOnPath(pts: Point[], p: Point): { point: Point; horizontal: boolean; index: number; dist: number } {
  let best = { point: pts[0], horizontal: true, index: 0, dist: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.01;
    let q: Point;
    if (horizontal) q = { x: clamp(p.x, Math.min(a.x, b.x), Math.max(a.x, b.x)), y: a.y };
    else q = { x: a.x, y: clamp(p.y, Math.min(a.y, b.y), Math.max(a.y, b.y)) };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.dist) best = { point: q, horizontal, index: i, dist: d };
  }
  return best;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function pointInRect(p: Point, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}
