import type { Id, Point, Role } from '../model/types';
import type { Layout } from './layout';
import { pointInRect } from './route';

export type Hit =
  | { kind: 'box'; id: Id; zone: Role }
  | { kind: 'junction'; id: Id }
  | { kind: 'referent'; id: Id }
  | { kind: 'arrow'; id: Id; point: Point }
  | { kind: 'label'; id: Id }
  | { kind: 'empty'; point: Point };

function distToSeg(p: Point, a: Point, b: Point): { d: number; q: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { d: Math.hypot(p.x - q.x, p.y - q.y), q };
}

export function hitTest(layout: Layout, p: Point, opts: { arrows?: boolean; labels?: boolean } = {}): Hit {
  if (opts.labels !== false) {
    for (let i = layout.arrows.length - 1; i >= 0; i--) {
      const l = layout.arrows[i].label;
      if (l && pointInRect(p, { x: l.cx - l.w / 2, y: l.cy - l.h / 2, w: l.w, h: l.h })) return { kind: 'label', id: layout.arrows[i].id };
    }
  }
  if (opts.arrows !== false) {
    let best: { id: Id; d: number; q: Point } | null = null;
    for (const a of layout.arrows) {
      for (let i = 0; i < a.points.length - 1; i++) {
        const r = distToSeg(p, a.points[i], a.points[i + 1]);
        if (r.d <= 6 && (!best || r.d < best.d)) best = { id: a.id, d: r.d, q: r.q };
      }
    }
    if (best) return { kind: 'arrow', id: best.id, point: { x: Math.round(best.q.x), y: Math.round(best.q.y) } };
  }
  for (let i = layout.junctions.length - 1; i >= 0; i--) {
    if (pointInRect(p, layout.junctions[i].rect, 2)) return { kind: 'junction', id: layout.junctions[i].id };
  }
  for (let i = layout.referents.length - 1; i >= 0; i--) {
    if (pointInRect(p, layout.referents[i].rect)) return { kind: 'referent', id: layout.referents[i].id };
  }
  for (let i = layout.boxes.length - 1; i >= 0; i--) {
    const r = layout.boxes[i].rect;
    if (pointInRect(p, r)) {
      const fy = (p.y - r.y) / r.h;
      const zone: Role = fy < 0.3 ? 'control' : fy > 0.7 ? 'mechanism' : 'input';
      return { kind: 'box', id: layout.boxes[i].id, zone };
    }
  }
  return { kind: 'empty', point: p };
}
