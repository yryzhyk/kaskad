import { abcOf, formatMoney } from '../model/abc';
import { ROLE_SIDE } from '../model/normalize';
import {
  boxNumber,
  diagramNode,
  diagramPageNumber,
  diagramTitle,
  findBox,
  isContext,
  parentDiagram,
  rootBox,
} from '../model/queries';
import type { Arrow, Box, Endpoint, Id, Idef0Diagram, Idef3Diagram, Model, Point, Rect, Role, Side } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { AREA, BOX_FONT_SIZE, JUNCTION_H, JUNCTION_W, LABEL_FONT_SIZE, MIN_BOX_FONT_SIZE, UOB_STRIP } from './page';
import { clamp, projectOnPath, rectsOverlap, route, type Dir } from './route';
import { measure, wrapText, wrapWords } from './text';

export interface BoxLayout {
  id: Id;
  rect: Rect;
  lines: string[];
  /** Розмір шрифту назви (зменшується, якщо назва не вміщається). */
  fontSize: number;
  /** Назва не вміщається в блок навіть мінімальним шрифтом. */
  overflow: boolean;
  number: string;
  cost?: string;
  kind: 'box' | 'uob';
  ref?: string;
}

export interface LabelLayout {
  lines: string[];
  /** Центр підпису. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  base: Point;
  leader?: [Point, Point];
}

export interface ArrowLayout {
  id: Id;
  points: Point[];
  head: boolean;
  doubleHead?: boolean;
  dashed?: boolean;
  label: LabelLayout | null;
  icom?: { text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  tunnel?: { x: number; y: number; side: Side };
  /** Підпис, що відображається у властивостях (з урахуванням батьківської стрілки). */
  effectiveLabel: string;
  dangling: boolean;
}

export interface JunctionLayout {
  id: Id;
  rect: Rect;
  symbol: string;
  sync: boolean;
  label: string;
}

export interface ReferentLayout {
  id: Id;
  rect: Rect;
  lines: string[];
}

export interface TreeNodeLayout {
  boxId: Id;
  rect: Rect;
  lines: string[];
  number: string;
}

export interface TreeLayout {
  nodes: TreeNodeLayout[];
  lines: Point[][];
  transform: { tx: number; ty: number; scale: number };
}

export interface FrameInfo {
  node: string;
  title: string;
  number: number;
  author: string;
  project: string;
  date: string;
  context: string;
}

export interface Layout {
  diagramId: Id;
  kind: 'idef0' | 'idef3' | 'nodetree';
  boxes: BoxLayout[];
  arrows: ArrowLayout[];
  junctions: JunctionLayout[];
  referents: ReferentLayout[];
  tree?: TreeLayout;
  frame: FrameInfo;
  warnings: string[];
  /** Порядок портів: boxId → role → ключі `${arrowId}:${end}` (для кодів ICOM). */
  ports: Map<Id, Record<Role, string[]>>;
}

const cache = new WeakMap<Model, Map<Id, Layout>>();

export function getLayout(model: Model, diagramId: Id): Layout | null {
  let m = cache.get(model);
  if (!m) {
    m = new Map();
    cache.set(model, m);
  }
  const hit = m.get(diagramId);
  if (hit) return hit;
  let res: Layout | null = null;
  if (diagramId === NODE_TREE_ID) res = layoutNodeTree(model);
  else {
    const d = model.diagrams[diagramId];
    if (!d) return null;
    res = d.kind === 'idef0' ? layoutIdef0(model, d) : layoutIdef3(model, d);
  }
  m.set(diagramId, res);
  return res;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function frameInfo(model: Model, diagramId: Id): FrameInfo {
  let context = 'TOP';
  if (diagramId === NODE_TREE_ID) context = '—';
  else if (!isContext(model, diagramId)) {
    const pd = parentDiagram(model, diagramId);
    context = pd ? diagramNode(model, pd.id) : '';
  }
  return {
    node: diagramNode(model, diagramId),
    title: diagramTitle(model, diagramId) + (diagramId === NODE_TREE_ID ? ' (дерево вузлів)' : ''),
    number: diagramPageNumber(model, diagramId),
    author: model.author,
    project: model.name,
    date: formatDate(model.createdAt),
    context,
  };
}

/**
 * Підбір шрифту для назви блоку: від 13 px до 9 px з кроком 0,5 px, без розбиття слів.
 * Якщо й так не вміщається — мінімальний шрифт з розбиттям слів, і якщо все одно
 * не вміщається — overflow = true (попередження на блоці та у властивостях). Текст не обрізається.
 */
export function fitBoxText(name: string, w: number, textH: number): { lines: string[]; fontSize: number; overflow: boolean } {
  const maxW = w - 12;
  const fits = (lines: string[], size: number) => lines.length * (size + 2) - 2 <= textH - 4;
  for (let size = BOX_FONT_SIZE; size >= MIN_BOX_FONT_SIZE; size -= 0.5) {
    const lines = wrapWords(name, maxW, size);
    if (lines && fits(lines, size)) return { lines, fontSize: size, overflow: false };
  }
  const lines = wrapText(name, maxW, MIN_BOX_FONT_SIZE);
  return { lines, fontSize: MIN_BOX_FONT_SIZE, overflow: !fits(lines, MIN_BOX_FONT_SIZE) };
}

export function boxTextHeight(kind: 'box' | 'uob', h: number): number {
  return kind === 'uob' ? h - UOB_STRIP : h - 10;
}

function boxLayout(model: Model, box: Box, kind: 'box' | 'uob'): BoxLayout {
  const rect = { x: box.x, y: box.y, w: box.w, h: box.h };
  const fit = fitBoxText(box.name, box.w, boxTextHeight(kind, box.h));
  const res: BoxLayout = { id: box.id, rect, ...fit, number: boxNumber(model, box.id), kind, ref: box.ref };
  if (model.abc.showCost) res.cost = formatMoney(model, abcOf(model, box).total);
  return res;
}

function overflowWarnings(boxes: BoxLayout[]): string[] {
  const bad = boxes.filter((b) => b.overflow);
  if (!bad.length) return [];
  return [`Назва не вміщається в блок навіть шрифтом ${MIN_BOX_FONT_SIZE} px: ${bad.map((b) => b.number).join(', ')}. Збільште блок або скоротіть назву.`];
}

// ---------------------------------------------------------------- IDEF0

interface Resolved {
  p: Point;
  dir: Dir;
}

const ROLE_PREFIX: Record<Role, string> = { input: 'I', control: 'C', output: 'O', mechanism: 'M' };

function inwardDir(side: Side): Dir {
  return side === 'left' ? 'R' : side === 'right' ? 'L' : side === 'top' ? 'D' : 'U';
}
function outwardDir(side: Side): Dir {
  return side === 'left' ? 'L' : side === 'right' ? 'R' : side === 'top' ? 'U' : 'D';
}

/** Ефективна назва стрілки (для гілок без власної назви — назва батьківської стрілки). */
export function arrowEffectiveLabel(model: Model, diagram: Idef0Diagram, arrow: Arrow, depth = 0): string {
  if (depth > 20) return arrow.label;
  for (const e of [arrow.source, arrow.target]) {
    if (e.kind === 'border' && e.parentArrowId) {
      const pd = diagram.parentBoxId ? findBox(model, diagram.parentBoxId)?.diagram : undefined;
      if (pd && pd.kind === 'idef0') {
        const pa = pd.arrows.find((a) => a.id === e.parentArrowId);
        if (pa) return arrowEffectiveLabel(model, pd, pa, depth + 1);
      }
    }
  }
  if (arrow.label) return arrow.label;
  if (arrow.source.kind === 'arrow') {
    const srcId = arrow.source.arrowId;
    const pa = diagram.arrows.find((a) => a.id === srcId);
    if (pa) return arrowEffectiveLabel(model, diagram, pa, depth + 1);
  }
  if (arrow.target.kind === 'arrow') {
    const tgtId = arrow.target.arrowId;
    const pa = diagram.arrows.find((a) => a.id === tgtId);
    if (pa) return arrowEffectiveLabel(model, diagram, pa, depth + 1);
  }
  return '';
}

/** Код ICOM граничної стрілки дочірньої діаграми. */
export function icomCode(model: Model, diagram: Idef0Diagram, e: Endpoint): string {
  if (e.kind !== 'border' || !e.parentArrowId || !diagram.parentBoxId) return '';
  const pd = findBox(model, diagram.parentBoxId)?.diagram;
  if (!pd) return '';
  const pl = getLayout(model, pd.id);
  const ports = pl?.ports.get(diagram.parentBoxId);
  if (!ports) return '';
  const key = `${e.parentArrowId}:${e.parentEnd ?? 'target'}`;
  for (const role of ['input', 'control', 'output', 'mechanism'] as Role[]) {
    const i = ports[role].indexOf(key);
    if (i >= 0) return `${ROLE_PREFIX[role]}${i + 1}`;
  }
  return '';
}

function layoutIdef0(model: Model, d: Idef0Diagram): Layout {
  const boxes = d.boxes.map((b) => boxLayout(model, b, 'box'));
  const rects = new Map(d.boxes.map((b) => [b.id, { x: b.x, y: b.y, w: b.w, h: b.h }]));
  const arrowsById = new Map(d.arrows.map((a) => [a.id, a]));
  const context = isContext(model, d.id);

  // Наближені координати кінця (для впорядкування портів)
  const approx = (e: Endpoint): Point => {
    switch (e.kind) {
      case 'box': {
        const r = rects.get(e.boxId)!;
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      }
      case 'arrow':
      case 'point':
        return { x: e.x, y: e.y };
      case 'border': {
        const mid = { x: (AREA.left + AREA.right) / 2, y: (AREA.top + AREA.bottom) / 2 };
        let along = e.offset;
        if (along === undefined && e.parentArrowId) {
          const code = icomCode(model, d, e);
          const n = Number(code.slice(1)) || 1;
          along = e.side === 'left' || e.side === 'right' ? AREA.top + n * 40 : AREA.left + n * 60;
        }
        if (e.side === 'left') return { x: AREA.left, y: along ?? mid.y };
        if (e.side === 'right') return { x: AREA.right, y: along ?? mid.y };
        if (e.side === 'top') return { x: along ?? mid.x, y: AREA.top };
        return { x: along ?? mid.x, y: AREA.bottom };
      }
    }
  };

  // Порти блоків
  const ports = new Map<Id, Record<Role, string[]>>();
  const portPos = new Map<string, Resolved>();
  for (const b of d.boxes) {
    const lists: Record<Role, { key: string; ref: number; idx: number }[]> = { input: [], control: [], output: [], mechanism: [] };
    d.arrows.forEach((a, idx) => {
      if (a.source.kind === 'box' && a.source.boxId === b.id) {
        const o = approx(a.target);
        lists.output.push({ key: `${a.id}:source`, ref: o.y, idx });
      }
      if (a.target.kind === 'box' && a.target.boxId === b.id) {
        const o = approx(a.source);
        const role = a.target.role;
        lists[role].push({ key: `${a.id}:target`, ref: role === 'input' ? o.y : o.x, idx });
      }
    });
    const rec: Record<Role, string[]> = { input: [], control: [], output: [], mechanism: [] };
    for (const role of Object.keys(lists) as Role[]) {
      const l = lists[role].sort((p, q) => p.ref - q.ref || p.idx - q.idx);
      rec[role] = l.map((x) => x.key);
      const n = l.length;
      l.forEach((item, i) => {
        const f = (i + 1) / (n + 1);
        let p: Point;
        let dir: Dir;
        switch (role) {
          case 'input':
            p = { x: b.x, y: b.y + b.h * f };
            dir = 'R';
            break;
          case 'output':
            p = { x: b.x + b.w, y: b.y + b.h * f };
            dir = 'R';
            break;
          case 'control':
            p = { x: b.x + b.w * f, y: b.y };
            dir = 'D';
            break;
          default:
            p = { x: b.x + b.w * f, y: b.y + b.h };
            dir = 'U';
        }
        portPos.set(item.key, { p: { x: Math.round(p.x), y: Math.round(p.y) }, dir });
      });
    }
    ports.set(b.id, rec);
  }

  // вирівнювання прямих стрілок «вихід → вхід», якщо на сторонах лише по одній стрілці
  for (const a of d.arrows) {
    if (a.source.kind !== 'box' || a.target.kind !== 'box' || a.target.role !== 'input') continue;
    const ps = ports.get(a.source.boxId);
    const pt = ports.get(a.target.boxId);
    if (!ps || !pt || ps.output.length !== 1 || pt.input.length !== 1) continue;
    const r1 = rects.get(a.source.boxId)!;
    const r2 = rects.get(a.target.boxId)!;
    if (r2.x <= r1.x + r1.w) continue;
    const lo = Math.max(r1.y, r2.y) + 8;
    const hi = Math.min(r1.y + r1.h, r2.y + r2.h) - 8;
    if (lo > hi) continue;
    const s1 = portPos.get(`${a.id}:source`)!;
    const t1 = portPos.get(`${a.id}:target`)!;
    const y = Math.round(clamp((s1.p.y + t1.p.y) / 2, lo, hi));
    s1.p = { x: s1.p.x, y };
    t1.p = { x: t1.p.x, y };
  }

  const obstacles = d.boxes.map((b) => rects.get(b.id)!);
  const paths = new Map<Id, Point[]>();
  const resolving = new Set<Id>();
  const results = new Map<Id, ArrowLayout>();

  const borderPos = (side: Side, other: Resolved | null, isSource: boolean, offset?: number): Point => {
    const horizontalBorder = side === 'top' || side === 'bottom';
    let along: number;
    if (offset !== undefined) along = offset;
    else if (!other) along = horizontalBorder ? (AREA.left + AREA.right) / 2 : (AREA.top + AREA.bottom) / 2;
    else {
      const od = other.dir;
      const otherVertical = od === 'U' || od === 'D';
      if (horizontalBorder) {
        if (otherVertical) along = other.p.x;
        else along = other.p.x + (isSource ? (od === 'R' ? -45 : 45) : od === 'R' ? 45 : -45);
      } else {
        if (!otherVertical) along = other.p.y;
        else along = other.p.y + (isSource ? (od === 'D' ? -40 : 40) : od === 'D' ? 40 : -40);
      }
    }
    if (horizontalBorder) {
      along = clamp(along, AREA.left + 12, AREA.right - 12);
      return { x: along, y: side === 'top' ? AREA.top : AREA.bottom };
    }
    along = clamp(along, AREA.top + 12, AREA.bottom - 12);
    return { x: side === 'left' ? AREA.left : AREA.right, y: along };
  };

  const estimate = (e: Endpoint, near: Point): Point => {
    if (e.kind === 'box') {
      const r = rects.get(e.boxId);
      return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : near;
    }
    if (e.kind === 'border') {
      if (e.side === 'left') return { x: AREA.left, y: near.y };
      if (e.side === 'right') return { x: AREA.right, y: near.y };
      if (e.side === 'top') return { x: near.x, y: AREA.top };
      return { x: near.x, y: AREA.bottom };
    }
    return { x: e.x, y: e.y };
  };

  const resolveArrowEnd = (e: Extract<Endpoint, { kind: 'arrow' }>, other: Endpoint, isSource: boolean): Resolved => {
    const anchor = { x: e.x, y: e.y };
    const parentPath = computePath(e.arrowId);
    if (!parentPath) return { p: anchor, dir: 'R' };
    const pr = projectOnPath(parentPath, anchor);
    const p = { x: Math.round(pr.point.x), y: Math.round(pr.point.y) };
    let otherP: Point;
    if (other.kind === 'box' && isSource) {
      const pp = portPos.get(`${currentArrowId}:target`);
      otherP = pp ? pp.p : estimate(other, p);
    } else if (other.kind === 'box') {
      const pp = portPos.get(`${currentArrowId}:source`);
      otherP = pp ? pp.p : estimate(other, p);
    } else otherP = estimate(other, p);
    let dir: Dir;
    if (pr.horizontal) {
      if (isSource) dir = otherP.y >= p.y ? 'D' : 'U';
      else dir = otherP.y <= p.y ? 'D' : 'U';
    } else {
      if (isSource) dir = otherP.x >= p.x ? 'R' : 'L';
      else dir = otherP.x <= p.x ? 'R' : 'L';
    }
    return { p, dir };
  };

  let currentArrowId = '';

  function computePath(id: Id): Point[] | null {
    const done = paths.get(id);
    if (done) return done;
    const a = arrowsById.get(id);
    if (!a || resolving.has(id)) return null;
    resolving.add(id);
    const saveCurrent = currentArrowId;
    currentArrowId = id;
    const resolveStrong = (e: Endpoint, other: Endpoint, isSource: boolean): Resolved | null => {
      if (e.kind === 'box') return portPos.get(`${a.id}:${isSource ? 'source' : 'target'}`) ?? null;
      if (e.kind === 'arrow') return resolveArrowEnd(e, other, isSource);
      return null;
    };
    let s = resolveStrong(a.source, a.target, true);
    currentArrowId = id;
    let t = resolveStrong(a.target, a.source, false);
    currentArrowId = id;
    // кінці типу border/point
    const finish = (e: Endpoint, other: Resolved | null, isSource: boolean): Resolved => {
      if (e.kind === 'border') {
        const p = borderPos(e.side, other, isSource, e.offset);
        return { p, dir: isSource ? inwardDir(e.side) : outwardDir(e.side) };
      }
      if (e.kind === 'point') return { p: { x: e.x, y: e.y }, dir: other?.dir ?? 'R' };
      return { p: { x: 0, y: 0 }, dir: 'R' };
    };
    if (!s && !t) {
      // border/point з обох боків
      if (a.source.kind === 'point' && a.target.kind === 'border') {
        const tmp = { p: { x: a.source.x, y: a.source.y }, dir: outwardDir(a.target.side) };
        t = finish(a.target, tmp, false);
        s = { p: tmp.p, dir: t.dir };
      } else if (a.source.kind === 'border' && a.target.kind === 'point') {
        const tmp = { p: { x: a.target.x, y: a.target.y }, dir: inwardDir(a.source.side) };
        s = finish(a.source, tmp, true);
        t = { p: tmp.p, dir: s.dir };
      } else {
        s = finish(a.source, null, true);
        t = finish(a.target, s, false);
      }
    } else if (!s) s = finish(a.source, t, true);
    else if (!t) t = finish(a.target, s, false);
    const pts = route(s!.p, s!.dir, t!.p, t!.dir, obstacles, a.bend);
    paths.set(id, pts);
    resolving.delete(id);
    currentArrowId = saveCurrent;
    return pts;
  }

  for (const a of d.arrows) computePath(a.id);

  // Підписи
  const placed: Rect[] = [];
  const boxRects = obstacles;
  const allSegs: [Point, Point][] = [];
  for (const pts of paths.values()) for (let i = 0; i < pts.length - 1; i++) allSegs.push([pts[i], pts[i + 1]]);

  // спочатку стрілки з ручним положенням підпису
  const order = [...d.arrows].sort((x, y) => Number(!!y.labelOffset) - Number(!!x.labelOffset));
  for (const a of order) {
    const pts = paths.get(a.id) ?? [];
    const effective = arrowEffectiveLabel(model, d, a);
    const linked = [a.source, a.target].some((e) => e.kind === 'border' && !!e.parentArrowId);
    const text = linked ? effective : a.label;
    let label: LabelLayout | null = null;
    if (text && pts.length >= 2) label = placeLabel(text, pts, a.labelOffset, boxRects, placed, allSegs);
    if (label) placed.push({ x: label.cx - label.w / 2, y: label.cy - label.h / 2, w: label.w, h: label.h });
    const head = a.target.kind !== 'arrow';
    const res: ArrowLayout = {
      id: a.id,
      points: pts,
      head,
      label,
      effectiveLabel: effective,
      dangling: a.source.kind === 'point' || a.target.kind === 'point',
    };
    // ICOM або тунель
    const borderEnd = a.source.kind === 'border' ? a.source : a.target.kind === 'border' ? a.target : null;
    if (borderEnd && pts.length >= 2 && !context) {
      const bp = a.source.kind === 'border' ? pts[0] : pts[pts.length - 1];
      if (borderEnd.parentArrowId) {
        const code = icomCode(model, d, borderEnd);
        if (code) {
          const side = borderEnd.side;
          if (side === 'left') res.icom = { text: code, x: bp.x + 4, y: bp.y + 14, anchor: 'start' };
          else if (side === 'right') res.icom = { text: code, x: bp.x - 4, y: bp.y + 14, anchor: 'end' };
          else if (side === 'top') res.icom = { text: code, x: bp.x + 4, y: bp.y + 13, anchor: 'start' };
          else res.icom = { text: code, x: bp.x + 4, y: bp.y - 5, anchor: 'start' };
        }
      } else {
        res.tunnel = { x: bp.x, y: bp.y, side: borderEnd.side };
      }
    }
    results.set(a.id, res);
  }

  const warnings: string[] = [];
  if (context) {
    if (d.boxes.length !== 1) warnings.push('Контекстна діаграма A-0 повинна містити рівно один блок.');
  } else if (d.boxes.length < 3 || d.boxes.length > 6) {
    warnings.push(`Діаграма декомпозиції має містити від 3 до 6 блоків (зараз: ${d.boxes.length}).`);
  }
  warnings.push(...overflowWarnings(boxes));
  const dangling = d.arrows.filter((a) => a.source.kind === 'point' || a.target.kind === 'point');
  if (dangling.length) {
    const codes = dangling.map((a) => results.get(a.id)?.icom?.text).filter(Boolean);
    warnings.push(`Непід'єднані граничні стрілки: ${codes.join(', ') || dangling.length}. Під'єднайте їх інструментом «Стрілка».`);
  }

  return {
    diagramId: d.id,
    kind: 'idef0',
    boxes,
    arrows: d.arrows.map((a) => results.get(a.id)!),
    junctions: [],
    referents: [],
    frame: frameInfo(model, d.id),
    warnings,
    ports,
  };
}

function segIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  return hi.x >= r.x && lo.x <= r.x + r.w && hi.y >= r.y && lo.y <= r.y + r.h;
}

function placeLabel(
  text: string,
  pts: Point[],
  offset: Point | undefined,
  boxes: Rect[],
  placed: Rect[],
  segs: [Point, Point][],
): LabelLayout {
  const longest = Math.max(...text.split(/\s+/).map((w) => measure(w, LABEL_FONT_SIZE)));
  const maxW = Math.max(90, Math.min(150, longest + 4));
  const lines = wrapText(text, maxW, LABEL_FONT_SIZE);
  const w = Math.max(...lines.map((l) => measure(l, LABEL_FONT_SIZE))) + 4;
  const h = lines.length * (LABEL_FONT_SIZE + 2) + 2;
  // базова точка — середина найдовшого відрізка
  let bi = 0;
  let bl = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.abs(pts[i].x - pts[i + 1].x) + Math.abs(pts[i].y - pts[i + 1].y);
    if (l > bl) {
      bl = l;
      bi = i;
    }
  }
  const base = { x: (pts[bi].x + pts[bi + 1].x) / 2, y: (pts[bi].y + pts[bi + 1].y) / 2 };
  let cx: number;
  let cy: number;
  if (offset) {
    cx = base.x + offset.x;
    cy = base.y + offset.y;
  } else {
    let best = { cost: Infinity, cx: base.x, cy: base.y - h / 2 - 3 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        const px = a.x + (b.x - a.x) * f;
        const py = a.y + (b.y - a.y) * f;
        const opts = horizontal
          ? [
              { cx: px, cy: py - h / 2 - 3 },
              { cx: px, cy: py + h / 2 + 3 },
            ]
          : [
              { cx: px + w / 2 + 5, cy: py },
              { cx: px - w / 2 - 5, cy: py },
            ];
        for (const o of opts) {
          const r = { x: o.cx - w / 2, y: o.cy - h / 2, w, h };
          let cost = 0;
          if (horizontal && len < w + 10) cost += 40;
          if (!horizontal && len < h + 10) cost += 40;
          if (!horizontal) cost += 8;
          cost += Math.abs(f - 0.5) * 10;
          for (const br of boxes) if (rectsOverlap(r, br, 2)) cost += 1000;
          for (const pr of placed) if (rectsOverlap(r, pr, 2)) cost += 800;
          for (const [s1, s2] of segs) if (segIntersectsRect(s1, s2, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 })) cost += 120;
          if (r.x < AREA.left + 2 || r.x + r.w > AREA.right - 2 || r.y < AREA.top + 2 || r.y + r.h > AREA.bottom - 2) cost += 1500;
          if (cost < best.cost) best = { cost, cx: o.cx, cy: o.cy };
        }
      }
    }
    cx = best.cx;
    cy = best.cy;
  }
  const label: LabelLayout = { lines, cx, cy, w, h, base };
  // виносна лінія, якщо підпис далеко від стрілки
  const pr = projectOnPath(pts, { x: cx, y: cy });
  const rx = clamp(pr.point.x, cx - w / 2, cx + w / 2);
  const ry = clamp(pr.point.y, cy - h / 2, cy + h / 2);
  if (Math.hypot(rx - pr.point.x, ry - pr.point.y) > 22) label.leader = [{ x: rx, y: ry }, pr.point];
  return label;
}

// ---------------------------------------------------------------- IDEF3

export const JUNCTION_SYMBOL: Record<string, string> = { and: '&', xor: 'X', or: 'O' };

interface NodeGeom {
  id: Id;
  rect: Rect;
}

function layoutIdef3(model: Model, d: Idef3Diagram): Layout {
  const boxes = d.boxes.map((b) => boxLayout(model, b, 'uob'));
  const nodes = new Map<Id, NodeGeom>();
  for (const b of d.boxes) nodes.set(b.id, { id: b.id, rect: { x: b.x, y: b.y, w: b.w, h: b.h } });
  for (const j of d.junctions) nodes.set(j.id, { id: j.id, rect: { x: j.x, y: j.y, w: JUNCTION_W, h: JUNCTION_H } });
  for (const r of d.referents) nodes.set(r.id, { id: r.id, rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
  const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  // вибір сторін
  const sides = new Map<Id, { from: Side; to: Side }>();
  for (const l of d.links) {
    const a = nodes.get(l.from);
    const b = nodes.get(l.to);
    if (!a || !b) continue;
    if (l.kind === 'relational') {
      const ca = center(a.rect);
      const cb = center(b.rect);
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      if (Math.abs(dy) > Math.abs(dx) * 0.6) sides.set(l.id, dy > 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' });
      else sides.set(l.id, dx > 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' });
    } else sides.set(l.id, { from: 'right', to: 'left' });
  }
  // порти
  const portLists = new Map<string, { key: string; ref: number; idx: number }[]>();
  d.links.forEach((l, idx) => {
    const s = sides.get(l.id);
    const a = nodes.get(l.from);
    const b = nodes.get(l.to);
    if (!s || !a || !b) return;
    const push = (nodeId: Id, side: Side, key: string, otherC: Point) => {
      const k = `${nodeId}|${side}`;
      if (!portLists.has(k)) portLists.set(k, []);
      portLists.get(k)!.push({ key, ref: side === 'left' || side === 'right' ? otherC.y : otherC.x, idx });
    };
    push(l.from, s.from, `${l.id}:from`, center(b.rect));
    push(l.to, s.to, `${l.id}:to`, center(a.rect));
  });
  const portPos = new Map<string, Point>();
  for (const [k, list] of portLists) {
    const [nodeId, side] = k.split('|') as [Id, Side];
    const r = nodes.get(nodeId)!.rect;
    list.sort((p, q) => p.ref - q.ref || p.idx - q.idx);
    const n = list.length;
    const isUob = d.boxes.some((b) => b.id === nodeId);
    list.forEach((item, i) => {
      const f = (i + 1) / (n + 1);
      let p: Point;
      const hEff = isUob && (side === 'left' || side === 'right') ? r.h - UOB_STRIP : r.h;
      if (side === 'left') p = { x: r.x, y: r.y + hEff * f };
      else if (side === 'right') p = { x: r.x + r.w, y: r.y + hEff * f };
      else if (side === 'top') p = { x: r.x + r.w * f, y: r.y };
      else p = { x: r.x + r.w * f, y: r.y + r.h };
      portPos.set(item.key, { x: Math.round(p.x), y: Math.round(p.y) });
    });
  }
  // вирівнювання: якщо на сторонах лише по одному з'єднанню — робимо зв'язок прямим
  const single = new Set<string>();
  for (const list of portLists.values()) if (list.length === 1) single.add(list[0].key);
  for (const l of d.links) {
    const s = sides.get(l.id);
    const k1 = `${l.id}:from`;
    const k2 = `${l.id}:to`;
    if (!s || !single.has(k1) || !single.has(k2)) continue;
    const p1 = portPos.get(k1)!;
    const p2 = portPos.get(k2)!;
    const r1 = nodes.get(l.from)!.rect;
    const r2 = nodes.get(l.to)!.rect;
    const isUob = (id: Id) => d.boxes.some((b) => b.id === id);
    if ((s.from === 'right' || s.from === 'left') && (s.to === 'left' || s.to === 'right')) {
      const lo1 = r1.y + 6;
      const hi1 = r1.y + r1.h - (isUob(l.from) ? UOB_STRIP : 0) - 6;
      const lo2 = r2.y + 6;
      const hi2 = r2.y + r2.h - (isUob(l.to) ? UOB_STRIP : 0) - 6;
      const lo = Math.max(lo1, lo2);
      const hi = Math.min(hi1, hi2);
      if (lo <= hi) {
        const y = clamp((p1.y + p2.y) / 2, lo, hi);
        p1.y = p2.y = Math.round(y);
      }
    } else if ((s.from === 'top' || s.from === 'bottom') && (s.to === 'top' || s.to === 'bottom')) {
      const lo = Math.max(r1.x + 6, r2.x + 6);
      const hi = Math.min(r1.x + r1.w - 6, r2.x + r2.w - 6);
      if (lo <= hi) {
        const x = clamp((p1.x + p2.x) / 2, lo, hi);
        p1.x = p2.x = Math.round(x);
      }
    }
  }
  const obstacles = [...nodes.values()].map((n) => n.rect);
  const placed: Rect[] = [];
  const pathMap = new Map<Id, Point[]>();
  for (const l of d.links) {
    const s = sides.get(l.id);
    const p1 = portPos.get(`${l.id}:from`);
    const p2 = portPos.get(`${l.id}:to`);
    if (!s || !p1 || !p2) continue;
    pathMap.set(l.id, route(p1, outwardDir(s.from), p2, inwardDir(s.to), obstacles, l.bend));
  }
  const segs: [Point, Point][] = [];
  for (const pts of pathMap.values()) for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  const arrows: ArrowLayout[] = [];
  for (const l of d.links) {
    const pts = pathMap.get(l.id);
    if (!pts) continue;
    const label = l.label ? placeLabel(l.label, pts, l.labelOffset, obstacles, placed, segs) : null;
    if (label) placed.push({ x: label.cx - label.w / 2, y: label.cy - label.h / 2, w: label.w, h: label.h });
    arrows.push({
      id: l.id,
      points: pts,
      head: true,
      doubleHead: l.kind === 'objectFlow',
      dashed: l.kind === 'relational',
      label,
      effectiveLabel: l.label,
      dangling: false,
    });
  }
  const junctions: JunctionLayout[] = d.junctions.map((j) => ({
    id: j.id,
    rect: { x: j.x, y: j.y, w: JUNCTION_W, h: JUNCTION_H },
    symbol: JUNCTION_SYMBOL[j.type],
    sync: j.type !== 'xor' && j.sync,
    label: `J${j.num}`,
  }));
  const referents: ReferentLayout[] = d.referents.map((r) => ({
    id: r.id,
    rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    lines: wrapText(r.name, r.w - 10, BOX_FONT_SIZE - 1),
  }));
  return {
    diagramId: d.id,
    kind: 'idef3',
    boxes,
    arrows,
    junctions,
    referents,
    frame: frameInfo(model, d.id),
    warnings: overflowWarnings(boxes),
    ports: new Map(),
  };
}

// ---------------------------------------------------------------- Дерево вузлів

interface TNode {
  box: Box;
  children: TNode[];
  x: number;
  depth: number;
}

function layoutNodeTree(model: Model): Layout {
  const root = rootBox(model);
  const build = (box: Box, depth: number): TNode => {
    const child = box.childDiagramId ? model.diagrams[box.childDiagramId] : undefined;
    const children = child && child.kind === 'idef0' ? child.boxes.map((b) => build(b, depth + 1)) : [];
    return { box, children, x: 0, depth };
  };
  const tree = build(root, 0);
  const NW = 130;
  const GAP = 24;
  let leaf = 0;
  let maxDepth = 0;
  const place = (n: TNode) => {
    maxDepth = Math.max(maxDepth, n.depth);
    if (!n.children.length) {
      n.x = leaf * (NW + GAP);
      leaf++;
    } else {
      n.children.forEach(place);
      n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
    }
  };
  place(tree);
  const all: TNode[] = [];
  const collect = (n: TNode) => {
    all.push(n);
    n.children.forEach(collect);
  };
  collect(tree);
  const linesOf = (b: Box) => wrapText(b.name, NW - 12, BOX_FONT_SIZE);
  const maxLines = Math.max(...all.map((n) => linesOf(n.box).length));
  const NH = Math.max(56, maxLines * (BOX_FONT_SIZE + 2) + 26);
  const LEVEL = NH + 50;
  const totalW = Math.max(NW, leaf * (NW + GAP) - GAP);
  const totalH = (maxDepth + 1) * LEVEL - 50;
  const availW = AREA.right - AREA.left - 60;
  const availH = AREA.bottom - AREA.top - 60;
  const scale = Math.min(1, availW / totalW, availH / totalH);
  const tx = AREA.left + (AREA.right - AREA.left - totalW * scale) / 2;
  const ty = AREA.top + 30;
  const nodes: TreeNodeLayout[] = all.map((n) => ({
    boxId: n.box.id,
    rect: { x: n.x, y: n.depth * LEVEL, w: NW, h: NH },
    lines: linesOf(n.box),
    number: boxNumber(model, n.box.id),
  }));
  const lines: Point[][] = [];
  for (const n of all) {
    if (!n.children.length) continue;
    const px = n.x + NW / 2;
    const py = n.depth * LEVEL + NH;
    const midY = py + 25;
    lines.push([
      { x: px, y: py },
      { x: px, y: midY },
    ]);
    const xsC = n.children.map((c) => c.x + NW / 2);
    lines.push([
      { x: Math.min(...xsC, px), y: midY },
      { x: Math.max(...xsC, px), y: midY },
    ]);
    for (const c of n.children) {
      lines.push([
        { x: c.x + NW / 2, y: midY },
        { x: c.x + NW / 2, y: c.depth * LEVEL },
      ]);
    }
  }
  return {
    diagramId: NODE_TREE_ID,
    kind: 'nodetree',
    boxes: [],
    arrows: [],
    junctions: [],
    referents: [],
    tree: { nodes, lines, transform: { tx, ty, scale } },
    frame: frameInfo(model, NODE_TREE_ID),
    warnings: [],
    ports: new Map(),
  };
}

export { ROLE_SIDE };
