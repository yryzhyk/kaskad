import { AREA } from '../geometry/page';
import { newId } from './factory';
import type { Arrow, Endpoint, Id, Idef0Diagram, Model, Role, Side } from './types';

export const ROLE_SIDE: Record<Role, Side> = { input: 'left', control: 'top', output: 'right', mechanism: 'bottom' };

interface Attachment {
  arrowId: Id;
  end: 'source' | 'target';
  role: Role;
}

/** Стрілки батьківської діаграми, приєднані до блоку boxId. */
export function attachmentsOf(diagram: Idef0Diagram, boxId: Id): Attachment[] {
  const res: Attachment[] = [];
  for (const a of diagram.arrows) {
    if (a.source.kind === 'box' && a.source.boxId === boxId) res.push({ arrowId: a.id, end: 'source', role: 'output' });
    if (a.target.kind === 'box' && a.target.boxId === boxId) res.push({ arrowId: a.id, end: 'target', role: a.target.role });
  }
  return res;
}

function isLinkedBorder(e: Endpoint): e is Extract<Endpoint, { kind: 'border' }> & { parentArrowId: Id } {
  return e.kind === 'border' && !!e.parentArrowId;
}

/**
 * Приводить модель до узгодженого стану (працює з чернеткою immer):
 *  - видаляє стрілки/зв'язки з неіснуючими кінцями та «осиротілі» діаграми;
 *  - синхронізує граничні стрілки дочірніх діаграм IDEF0 зі стрілками батьківського блоку.
 */
export function normalizeModel(model: Model): void {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    // Індекс блоків
    const boxDiagram = new Map<Id, Id>();
    for (const d of Object.values(model.diagrams)) for (const b of d.boxes) boxDiagram.set(b.id, d.id);
    // Діаграми без батька
    for (const d of Object.values(model.diagrams)) {
      if (d.id === model.rootDiagramId) continue;
      const pd = d.parentBoxId ? boxDiagram.get(d.parentBoxId) : undefined;
      const pbox = pd ? model.diagrams[pd].boxes.find((b) => b.id === d.parentBoxId) : undefined;
      if (!pbox || pbox.childDiagramId !== d.id) {
        delete model.diagrams[d.id];
        changed = true;
      }
    }
    for (const d of Object.values(model.diagrams)) {
      for (const b of d.boxes) {
        if (b.childDiagramId && !model.diagrams[b.childDiagramId]) {
          delete b.childDiagramId;
          changed = true;
        }
      }
      if (d.kind === 'idef0') {
        const boxIds = new Set(d.boxes.map((b) => b.id));
        const arrowIds = new Set(d.arrows.map((a) => a.id));
        const ok = (e: Endpoint) =>
          (e.kind === 'box' && boxIds.has(e.boxId)) ||
          (e.kind === 'arrow' && arrowIds.has(e.arrowId)) ||
          e.kind === 'border' ||
          e.kind === 'point';
        const keep = d.arrows.filter((a) => ok(a.source) && ok(a.target) && !(a.source.kind === 'arrow' && a.source.arrowId === a.id) && !(a.target.kind === 'arrow' && a.target.arrowId === a.id));
        if (keep.length !== d.arrows.length) {
          d.arrows = keep;
          changed = true;
        }
      } else {
        const ids = new Set<Id>([...d.boxes.map((b) => b.id), ...d.junctions.map((j) => j.id), ...d.referents.map((r) => r.id)]);
        const keep = d.links.filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
        if (keep.length !== d.links.length) {
          d.links = keep;
          changed = true;
        }
      }
    }
    if (syncBoundaries(model)) changed = true;
  }
}

function syncBoundaries(model: Model): boolean {
  let changed = false;
  const boxDiagram = new Map<Id, Id>();
  for (const d of Object.values(model.diagrams)) for (const b of d.boxes) boxDiagram.set(b.id, d.id);
  for (const d of Object.values(model.diagrams)) {
    if (d.kind !== 'idef0' || !d.parentBoxId) continue;
    const pdId = boxDiagram.get(d.parentBoxId);
    const pd = pdId ? model.diagrams[pdId] : undefined;
    if (!pd || pd.kind !== 'idef0') continue;
    const atts = attachmentsOf(pd, d.parentBoxId);
    const key = (id: Id, end: string) => `${id}:${end}`;
    const attMap = new Map(atts.map((a) => [key(a.arrowId, a.end), a]));
    const existing = new Map<string, Arrow>();
    const remove = new Set<Id>();
    for (const a of d.arrows) {
      for (const e of [a.source, a.target]) {
        if (isLinkedBorder(e)) {
          const k = key(e.parentArrowId, e.parentEnd ?? 'target');
          const att = attMap.get(k);
          if (!att || existing.has(k)) {
            remove.add(a.id);
          } else {
            existing.set(k, a);
            const side = ROLE_SIDE[att.role];
            if (e.side !== side) {
              e.side = side;
              changed = true;
            }
          }
        }
      }
    }
    if (remove.size) {
      d.arrows = d.arrows.filter((a) => !remove.has(a.id));
      changed = true;
    }
    // Нові граничні стрілки
    const missing = atts.filter((a) => !existing.has(key(a.arrowId, a.end)));
    if (missing.length) {
      const byRole: Record<Role, Attachment[]> = { input: [], control: [], output: [], mechanism: [] };
      for (const a of atts) byRole[a.role].push(a);
      for (const att of missing) {
        const list = byRole[att.role];
        const i = list.indexOf(att);
        const frac = (i + 1) / (list.length + 1);
        const ys = AREA.top + (AREA.bottom - AREA.top) * frac;
        const xs = AREA.left + (AREA.right - AREA.left) * frac;
        const border: Endpoint = { kind: 'border', side: ROLE_SIDE[att.role], parentArrowId: att.arrowId, parentEnd: att.end };
        let point: Endpoint;
        switch (att.role) {
          case 'input':
            point = { kind: 'point', x: AREA.left + 60, y: Math.round(ys) };
            break;
          case 'control':
            point = { kind: 'point', x: Math.round(xs), y: AREA.top + 50 };
            break;
          case 'mechanism':
            point = { kind: 'point', x: Math.round(xs), y: AREA.bottom - 50 };
            break;
          default:
            point = { kind: 'point', x: AREA.right - 60, y: Math.round(ys) };
        }
        const arrow: Arrow = {
          id: newId('a'),
          label: '',
          definition: '',
          source: att.end === 'target' ? border : point,
          target: att.end === 'target' ? point : border,
        };
        d.arrows.push(arrow);
      }
      changed = true;
    }
  }
  return changed;
}
