import type { Hit } from '../geometry/hit';
import { AREA, BOX_H, BOX_W, JUNCTION_H, JUNCTION_W, MIN_BOX_H, MIN_BOX_W, REFERENT_H, REFERENT_W, UOB_H, UOB_W, snap } from '../geometry/page';
import { createBox, createIdef0Child, createIdef3Child, newId, staircase, uobRow } from './factory';
import type { Arrow, Endpoint, Id, Idef0Diagram, Idef3Diagram, JunctionType, Model, Rect, Side } from './types';

export type ElementKind = 'box' | 'arrow' | 'junction' | 'referent' | 'link';

export interface Selection {
  kind: ElementKind;
  id: Id;
}

export interface OpResult {
  ok: boolean;
  message?: string;
  id?: Id;
}

function idef0(m: Model, diagramId: Id): Idef0Diagram | null {
  const d = m.diagrams[diagramId];
  return d && d.kind === 'idef0' ? d : null;
}
function idef3(m: Model, diagramId: Id): Idef3Diagram | null {
  const d = m.diagrams[diagramId];
  return d && d.kind === 'idef3' ? d : null;
}

function clampToArea(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return {
    x: snap(Math.max(AREA.left + 4, Math.min(AREA.right - w - 4, x))),
    y: snap(Math.max(AREA.top + 4, Math.min(AREA.bottom - h - 4, y))),
  };
}

export function addBox(m: Model, diagramId: Id, cx: number, cy: number): OpResult {
  const d = m.diagrams[diagramId];
  if (!d) return { ok: false };
  if (d.kind === 'idef0') {
    if (diagramId === m.rootDiagramId) return { ok: false, message: 'Контекстна діаграма A-0 містить лише один блок.' };
    const p = clampToArea(cx - BOX_W / 2, cy - BOX_H / 2, BOX_W, BOX_H);
    const b = createBox(`Робота ${d.boxes.length + 1}`, p.x, p.y);
    d.boxes.push(b);
    return { ok: true, id: b.id };
  }
  const p = clampToArea(cx - UOB_W / 2, cy - UOB_H / 2, UOB_W, UOB_H);
  m.counters.uob += 1;
  const b = createBox(`Дія ${d.boxes.length + 1}`, p.x, p.y, UOB_W, UOB_H);
  b.num = m.counters.uob;
  d.boxes.push(b);
  return { ok: true, id: b.id };
}

export function addJunction(m: Model, diagramId: Id, type: JunctionType, sync: boolean, cx: number, cy: number): OpResult {
  const d = idef3(m, diagramId);
  if (!d) return { ok: false };
  const p = clampToArea(cx - JUNCTION_W / 2, cy - JUNCTION_H / 2, JUNCTION_W, JUNCTION_H);
  m.counters.junction += 1;
  const id = newId('j');
  d.junctions.push({ id, type, sync: type === 'xor' ? false : sync, num: m.counters.junction, x: p.x, y: p.y, definition: '' });
  return { ok: true, id };
}

export function addReferent(m: Model, diagramId: Id, cx: number, cy: number): OpResult {
  const d = idef3(m, diagramId);
  if (!d) return { ok: false };
  const p = clampToArea(cx - REFERENT_W / 2, cy - REFERENT_H / 2, REFERENT_W, REFERENT_H);
  const id = newId('r');
  d.referents.push({ id, name: `Об'єкт ${d.referents.length + 1}`, definition: '', x: p.x, y: p.y, w: REFERENT_W, h: REFERENT_H });
  return { ok: true, id };
}

/** Елемент, що має положення (блок, перехрестя, об'єкт-посилання). */
export function findPositioned(m: Model, diagramId: Id, id: Id): { x: number; y: number; w?: number; h?: number } | undefined {
  const d = m.diagrams[diagramId];
  if (!d) return undefined;
  const b = d.boxes.find((x) => x.id === id);
  if (b) return b;
  if (d.kind === 'idef3') return d.junctions.find((x) => x.id === id) ?? d.referents.find((x) => x.id === id);
  return undefined;
}

export function moveElement(m: Model, diagramId: Id, id: Id, x: number, y: number): void {
  const el = findPositioned(m, diagramId, id);
  if (!el) return;
  const w = el.w ?? JUNCTION_W;
  const h = el.h ?? JUNCTION_H;
  const p = clampToArea(x, y, w, h);
  el.x = p.x;
  el.y = p.y;
}

export function resizeElement(m: Model, diagramId: Id, id: Id, r: Rect): void {
  const el = findPositioned(m, diagramId, id);
  if (!el || el.w === undefined) return;
  const w = Math.max(MIN_BOX_W, snap(r.w));
  const h = Math.max(MIN_BOX_H, snap(r.h));
  const x = snap(Math.max(AREA.left + 2, r.x));
  const y = snap(Math.max(AREA.top + 2, r.y));
  el.x = x;
  el.y = y;
  el.w = Math.min(w, AREA.right - 2 - x);
  el.h = Math.min(h, AREA.bottom - 2 - y);
}

export function deleteElement(m: Model, diagramId: Id, sel: Selection): OpResult {
  const d = m.diagrams[diagramId];
  if (!d) return { ok: false };
  if (sel.kind === 'box') {
    if (diagramId === m.rootDiagramId) return { ok: false, message: 'Блок контекстної діаграми видалити не можна.' };
    d.boxes = d.boxes.filter((b) => b.id !== sel.id) as typeof d.boxes;
    return { ok: true };
  }
  if (d.kind === 'idef0' && sel.kind === 'arrow') {
    const a = d.arrows.find((x) => x.id === sel.id);
    if (!a) return { ok: false };
    const linked = [a.source, a.target].find((e) => e.kind === 'border' && e.parentArrowId);
    if (linked) {
      const inner = linked === a.source ? 'target' : 'source';
      if (a[inner].kind === 'point') return { ok: false, message: 'Граничну стрілку можна видалити лише на батьківській діаграмі.' };
      const pts = defaultStubPoint((linked as Extract<Endpoint, { kind: 'border' }>).side);
      a[inner] = { kind: 'point', ...pts };
      delete a.bend;
      return { ok: true, message: 'Граничну стрілку від\'єднано (її можна видалити лише на батьківській діаграмі).' };
    }
    d.arrows = d.arrows.filter((x) => x.id !== sel.id);
    return { ok: true };
  }
  if (d.kind === 'idef3') {
    if (sel.kind === 'junction') d.junctions = d.junctions.filter((x) => x.id !== sel.id);
    else if (sel.kind === 'referent') d.referents = d.referents.filter((x) => x.id !== sel.id);
    else if (sel.kind === 'link') d.links = d.links.filter((x) => x.id !== sel.id);
    return { ok: true };
  }
  return { ok: false };
}

function defaultStubPoint(side: Side): { x: number; y: number } {
  const midY = Math.round((AREA.top + AREA.bottom) / 2);
  const midX = Math.round((AREA.left + AREA.right) / 2);
  if (side === 'left') return { x: AREA.left + 60, y: midY };
  if (side === 'right') return { x: AREA.right - 60, y: midY };
  if (side === 'top') return { x: midX, y: AREA.top + 50 };
  return { x: midX, y: AREA.bottom - 50 };
}

export function decompose(m: Model, boxId: Id, kind: 'idef0' | 'idef3', count: number): OpResult {
  for (const d of Object.values(m.diagrams)) {
    const b = d.boxes.find((x) => x.id === boxId);
    if (!b) continue;
    if (b.childDiagramId && m.diagrams[b.childDiagramId]) return { ok: true, id: b.childDiagramId };
    if (kind === 'idef0' && d.kind === 'idef3') return { ok: false, message: 'Одиницю роботи IDEF3 можна декомпозувати лише в IDEF3.' };
    const n = Math.max(1, Math.min(12, Math.round(count)));
    const child = kind === 'idef0' ? createIdef0Child(boxId, n) : createIdef3Child(m, boxId, n);
    m.diagrams[child.id] = child;
    b.childDiagramId = child.id;
    return { ok: true, id: child.id };
  }
  return { ok: false };
}

export function removeDecomposition(m: Model, boxId: Id): void {
  for (const d of Object.values(m.diagrams)) {
    const b = d.boxes.find((x) => x.id === boxId);
    if (b) delete b.childDiagramId;
  }
}

export function reorderBox(m: Model, diagramId: Id, boxId: Id, newIndex: number): void {
  const d = m.diagrams[diagramId];
  if (!d) return;
  const i = d.boxes.findIndex((b) => b.id === boxId);
  if (i < 0) return;
  const boxes = d.boxes as unknown[];
  const [b] = boxes.splice(i, 1);
  boxes.splice(Math.max(0, Math.min(boxes.length, newIndex)), 0, b);
}

export function autoLayout(m: Model, diagramId: Id): void {
  const d = m.diagrams[diagramId];
  if (!d || diagramId === m.rootDiagramId) return;
  if (d.kind === 'idef0') {
    const pos = staircase(d.boxes.length);
    d.boxes.forEach((b, i) => {
      b.x = pos[i].x;
      b.y = pos[i].y;
      b.w = BOX_W;
      b.h = BOX_H;
    });
    for (const a of d.arrows) {
      delete a.bend;
      delete a.labelOffset;
    }
  } else {
    const pos = uobRow(d.boxes.length);
    d.boxes.forEach((b, i) => {
      b.x = pos[i].x;
      b.y = pos[i].y;
    });
  }
}

function nearestBorder(p: { x: number; y: number }): Side {
  const dl = Math.abs(p.x - AREA.left);
  const dr = Math.abs(AREA.right - p.x);
  const dt = Math.abs(p.y - AREA.top);
  const db = Math.abs(AREA.bottom - p.y);
  const min = Math.min(dl, dr, dt, db);
  if (min === dr) return 'right';
  if (min === dl) return 'left';
  if (min === dt) return 'top';
  return 'bottom';
}

const isInputStub = (a: Arrow) => a.source.kind === 'border' && a.target.kind === 'point';
const isOutputStub = (a: Arrow) => a.source.kind === 'point' && a.target.kind === 'border';

/** Створення стрілки IDEF0 інструментом «Стрілка» за двома точками (джерело і призначення). */
export function connectIdef0(m: Model, diagramId: Id, src: Hit, tgt: Hit): OpResult {
  const d = idef0(m, diagramId);
  if (!d) return { ok: false };
  const s = src;
  const t = tgt;
  if (s.kind === 'label' || t.kind === 'label') return { ok: false };
  if (s.kind === 'junction' || s.kind === 'referent' || t.kind === 'junction' || t.kind === 'referent') return { ok: false };

  // Продовження непід'єднаної граничної стрілки-входу
  if (s.kind === 'arrow') {
    const sa = d.arrows.find((a) => a.id === s.id);
    if (sa && isInputStub(sa)) {
      if (t.kind === 'box') {
        sa.target = { kind: 'box', boxId: t.id, role: t.zone };
        return { ok: true, id: sa.id };
      }
      if (t.kind === 'arrow' && t.id !== sa.id) {
        sa.target = { kind: 'arrow', arrowId: t.id, x: t.point.x, y: t.point.y };
        return { ok: true, id: sa.id };
      }
      return { ok: false, message: 'Оберіть блок, до якого під\'єднати граничну стрілку.' };
    }
  }
  let source: Endpoint | null = null;
  if (s.kind === 'box') source = { kind: 'box', boxId: s.id, role: 'output' };
  else if (s.kind === 'arrow') source = { kind: 'arrow', arrowId: s.id, x: s.point.x, y: s.point.y };

  // Продовження непід'єднаної граничної стрілки-виходу
  if (t.kind === 'arrow') {
    const ta = d.arrows.find((a) => a.id === t.id);
    if (ta && isOutputStub(ta)) {
      if (!source) return { ok: false, message: 'Почніть стрілку з блоку.' };
      if (source.kind === 'arrow' && source.arrowId === ta.id) return { ok: false };
      ta.source = source;
      return { ok: true, id: ta.id };
    }
  }
  let target: Endpoint | null = null;
  if (t.kind === 'box') target = { kind: 'box', boxId: t.id, role: t.zone };
  else if (t.kind === 'arrow') {
    if (s.kind === 'arrow' && s.id === t.id) return { ok: false, message: 'Стрілка не може зливатися сама з собою.' };
    target = { kind: 'arrow', arrowId: t.id, x: t.point.x, y: t.point.y };
  } else if (t.kind === 'empty') {
    if (!source) return { ok: false, message: 'Стрілку потрібно з\'єднати хоча б з одним блоком.' };
    target = { kind: 'border', side: nearestBorder(t.point) };
  }
  if (!source) {
    if (!target) return { ok: false };
    if (target.kind === 'box') {
      const side: Side = target.role === 'input' ? 'left' : target.role === 'control' ? 'top' : 'bottom';
      source = { kind: 'border', side };
    } else if (target.kind === 'arrow') {
      source = { kind: 'border', side: nearestBorder(s.kind === 'empty' ? s.point : { x: target.x, y: target.y }) };
    } else return { ok: false };
  }
  if (!target) return { ok: false };
  if (source.kind === 'border' && target.kind === 'border') return { ok: false };
  const arrow: Arrow = { id: newId('a'), label: '', definition: '', source, target };
  d.arrows.push(arrow);
  return { ok: true, id: arrow.id };
}

/** Граничну стрілку від краю діаграми до сторони блоку (або від виходу до правого краю). */
export function addBorderArrow(m: Model, diagramId: Id, boxId: Id, role: 'input' | 'control' | 'output' | 'mechanism', label = ''): OpResult {
  const d = idef0(m, diagramId);
  if (!d || !d.boxes.some((b) => b.id === boxId)) return { ok: false };
  let source: Endpoint;
  let target: Endpoint;
  if (role === 'output') {
    source = { kind: 'box', boxId, role: 'output' };
    target = { kind: 'border', side: 'right' };
  } else {
    source = { kind: 'border', side: role === 'input' ? 'left' : role === 'control' ? 'top' : 'bottom' };
    target = { kind: 'box', boxId, role };
  }
  const arrow: Arrow = { id: newId('a'), label, definition: '', source, target };
  d.arrows.push(arrow);
  return { ok: true, id: arrow.id };
}

export function connectBoxes(m: Model, diagramId: Id, fromBoxId: Id, toBoxId: Id, role: 'input' | 'control' | 'mechanism', label = ''): OpResult {
  const d = idef0(m, diagramId);
  if (!d) return { ok: false };
  const arrow: Arrow = {
    id: newId('a'),
    label,
    definition: '',
    source: { kind: 'box', boxId: fromBoxId, role: 'output' },
    target: { kind: 'box', boxId: toBoxId, role },
  };
  d.arrows.push(arrow);
  return { ok: true, id: arrow.id };
}

export function addLink(m: Model, diagramId: Id, from: Id, to: Id, label = ''): OpResult {
  const d = idef3(m, diagramId);
  if (!d) return { ok: false };
  if (from === to) return { ok: false, message: 'Зв\'язок має з\'єднувати різні елементи.' };
  if (d.links.some((l) => l.from === from && l.to === to)) return { ok: false, message: 'Такий зв\'язок уже існує.' };
  const isRef = (id: Id) => d.referents.some((r) => r.id === id);
  const id = newId('l');
  d.links.push({ id, kind: isRef(from) || isRef(to) ? 'relational' : 'precedence', label, definition: '', from, to });
  return { ok: true, id };
}

export function connectIdef3(m: Model, diagramId: Id, src: Hit, tgt: Hit): OpResult {
  const nodeId = (h: Hit) => (h.kind === 'box' || h.kind === 'junction' || h.kind === 'referent' ? h.id : null);
  const a = nodeId(src);
  const b = nodeId(tgt);
  if (!a || !b) return { ok: false, message: 'Зв\'язок з\'єднує одиниці роботи, перехрестя та об\'єкти-посилання.' };
  return addLink(m, diagramId, a, b);
}
