import type { Box, Diagram, Id, Idef0Diagram, Model } from './types';
import { NODE_TREE_ID } from './types';

interface BoxLoc {
  diagram: Diagram;
  box: Box;
  index: number;
}

const boxIndexCache = new WeakMap<Model, Map<Id, BoxLoc>>();

function boxIndex(model: Model): Map<Id, BoxLoc> {
  let idx = boxIndexCache.get(model);
  if (!idx) {
    idx = new Map();
    for (const d of Object.values(model.diagrams)) {
      d.boxes.forEach((box, index) => idx!.set(box.id, { diagram: d, box, index }));
    }
    boxIndexCache.set(model, idx);
  }
  return idx;
}

export function findBox(model: Model, boxId: Id): BoxLoc | undefined {
  return boxIndex(model).get(boxId);
}

export function parentDiagram(model: Model, diagramId: Id): Diagram | undefined {
  const d = model.diagrams[diagramId];
  if (!d || !d.parentBoxId) return undefined;
  return findBox(model, d.parentBoxId)?.diagram;
}

export function parentBox(model: Model, diagramId: Id): Box | undefined {
  const d = model.diagrams[diagramId];
  if (!d || !d.parentBoxId) return undefined;
  return findBox(model, d.parentBoxId)?.box;
}

export function isContext(model: Model, diagramId: Id): boolean {
  return diagramId === model.rootDiagramId;
}

export function rootBox(model: Model): Box {
  return (model.diagrams[model.rootDiagramId] as Idef0Diagram).boxes[0];
}

/** Номер блоку як у BPwin: A0, A1, A12, ... ; для UOB IDEF3 — наскрізний номер. */
export function boxNumber(model: Model, boxId: Id): string {
  const loc = findBox(model, boxId);
  if (!loc) return '';
  const { diagram, box, index } = loc;
  if (diagram.kind === 'idef3') return String(box.num ?? index + 1);
  if (diagram.id === model.rootDiagramId) return 'A0';
  const node = diagramNode(model, diagram.id);
  const prefix = node === 'A0' ? 'A' : node;
  return `${prefix}${index + 1}`;
}

/** Номер вузла діаграми: A-0, A0, A1, A11, ... */
export function diagramNode(model: Model, diagramId: Id): string {
  if (diagramId === NODE_TREE_ID) return 'A0';
  if (diagramId === model.rootDiagramId) return 'A-0';
  const d = model.diagrams[diagramId];
  if (!d || !d.parentBoxId) return '';
  return boxNumber(model, d.parentBoxId);
}

/** Назва діаграми (TITLE) — назва батьківської роботи. */
export function diagramTitle(model: Model, diagramId: Id): string {
  if (diagramId === NODE_TREE_ID) return `${rootBox(model)?.name ?? model.name}`;
  if (diagramId === model.rootDiagramId) return rootBox(model)?.name ?? model.name;
  return parentBox(model, diagramId)?.name ?? '';
}

export function diagramKindLabel(model: Model, diagramId: Id): string {
  if (diagramId === NODE_TREE_ID) return 'Дерево вузлів';
  const d = model.diagrams[diagramId];
  if (!d) return '';
  if (d.kind === 'idef3') return 'IDEF3';
  return diagramId === model.rootDiagramId ? 'IDEF0 (контекстна)' : 'IDEF0';
}

/** Діаграми в порядку обходу ієрархії (у глибину). Дерево вузлів — останнім. */
export function diagramOrder(model: Model, withNodeTree = true): Id[] {
  const res: Id[] = [];
  const visit = (id: Id) => {
    const d = model.diagrams[id];
    if (!d) return;
    res.push(id);
    for (const b of d.boxes) if (b.childDiagramId) visit(b.childDiagramId);
  };
  visit(model.rootDiagramId);
  if (withNodeTree) res.push(NODE_TREE_ID);
  return res;
}

export function diagramPageNumber(model: Model, diagramId: Id): number {
  return diagramOrder(model).indexOf(diagramId) + 1;
}

export function diagramLabel(model: Model, diagramId: Id): string {
  if (diagramId === NODE_TREE_ID) return 'Дерево вузлів';
  const d = model.diagrams[diagramId];
  const suffix = d?.kind === 'idef3' ? ' (IDEF3)' : '';
  return `${diagramNode(model, diagramId)} ${diagramTitle(model, diagramId)}${suffix}`;
}

export interface ActivityEntry {
  box: Box;
  diagramId: Id;
  depth: number;
  kind: 'idef0' | 'idef3';
}

/** Роботи в порядку обходу: починаючи з boxId (включно) і вся його декомпозиція. */
export function activitySubtree(model: Model, boxId?: Id): ActivityEntry[] {
  const res: ActivityEntry[] = [];
  const visitBox = (box: Box, diagramId: Id, depth: number) => {
    const d = model.diagrams[diagramId];
    res.push({ box, diagramId, depth, kind: d.kind });
    if (box.childDiagramId) {
      const child = model.diagrams[box.childDiagramId];
      if (child) for (const b of child.boxes) visitBox(b, child.id, depth + 1);
    }
  };
  if (boxId) {
    const loc = findBox(model, boxId);
    if (loc) visitBox(loc.box, loc.diagram.id, 0);
  } else {
    const root = model.diagrams[model.rootDiagramId];
    for (const b of root.boxes) visitBox(b, root.id, 0);
  }
  return res;
}

/** Діаграми, що входять до піддерева роботи (її декомпозиція рекурсивно). */
export function diagramSubtree(model: Model, boxId?: Id): Id[] {
  if (!boxId) return diagramOrder(model, false);
  const res: Id[] = [];
  for (const e of activitySubtree(model, boxId)) {
    if (e.box.childDiagramId && model.diagrams[e.box.childDiagramId]) res.push(e.box.childDiagramId);
  }
  return res;
}

export function activityLabel(model: Model, boxId: Id): string {
  const loc = findBox(model, boxId);
  if (!loc) return '';
  return `${boxNumber(model, boxId)} ${loc.box.name}`;
}
