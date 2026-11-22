import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import { createModel } from '../model/factory';
import { normalizeModel } from '../model/normalize';
import type { ElementKind, Selection } from '../model/ops';
import type { Id, JunctionType, Model } from '../model/types';
import { NODE_TREE_ID } from '../model/types';

type Listener = () => void;

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(next: T) {
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---------------------------------------------------------------- Модель з історією

const DRAFT_KEY = 'kaskad.draft.v1';
const HISTORY_LIMIT = 200;

interface ModelState {
  model: Model;
  past: Model[];
  future: Model[];
}

function normalized(m: Model): Model {
  return produce(m, (d) => normalizeModel(d as Model));
}

function loadDraft(): Model | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return parseModel(raw);
  } catch {
    return null;
  }
}

export function parseModel(text: string): Model {
  const data = JSON.parse(text);
  if (!data || data.format !== 'kaskad' || !data.diagrams || !data.rootDiagramId) throw new Error('Файл не є моделлю Kaskad.');
  const m = data as Model;
  m.abc = Object.assign({ currency: 'грн', timeUnit: 'години', showCost: false }, m.abc ?? {});
  m.costCenters = m.costCenters ?? [];
  m.counters = m.counters ?? { uob: 0, junction: 0 };
  for (const k of ['name', 'author', 'purpose', 'viewpoint', 'definition'] as const) m[k] = m[k] ?? '';
  for (const d of Object.values(m.diagrams)) {
    for (const b of d.boxes) {
      b.definition = b.definition ?? '';
      b.abc = Object.assign({ costs: {}, duration: 0, frequency: 1 }, b.abc ?? {});
    }
    if (d.kind === 'idef3') {
      d.junctions = d.junctions ?? [];
      d.referents = d.referents ?? [];
      d.links = d.links ?? [];
    } else d.arrows = d.arrows ?? [];
  }
  return normalized(m);
}

const initialModel = loadDraft() ?? createModel();
export const modelStore = createStore<ModelState>({ model: initialModel, past: [], future: [] });

let txBase: Model | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(modelStore.get().model));
    } catch {
      /* сховище недоступне */
    }
  }, 400);
}

export function getModel(): Model {
  return modelStore.get().model;
}

/** Зміна моделі з записом в історію (для Ctrl+Z). */
export function commit(recipe: (m: Draft<Model>) => void): Model {
  const s = modelStore.get();
  const next = normalized(produce(s.model, recipe));
  if (next === s.model) return next;
  if (txBase) {
    modelStore.set({ ...s, model: next });
  } else {
    modelStore.set({ model: next, past: [...s.past, s.model].slice(-HISTORY_LIMIT), future: [] });
  }
  scheduleSave();
  return next;
}

/** Початок неперервної дії (перетягування) — в історію потрапить один запис. */
export function beginTransaction() {
  if (txBase) endTransaction();
  txBase = modelStore.get().model;
}

export function endTransaction() {
  const s = modelStore.get();
  if (txBase && txBase !== s.model) {
    modelStore.set({ model: s.model, past: [...s.past, txBase].slice(-HISTORY_LIMIT), future: [] });
  }
  txBase = null;
}

export function undo() {
  const s = modelStore.get();
  if (!s.past.length) return;
  const prev = s.past[s.past.length - 1];
  modelStore.set({ model: prev, past: s.past.slice(0, -1), future: [s.model, ...s.future] });
  scheduleSave();
  fixUiAfterModelChange();
}

export function redo() {
  const s = modelStore.get();
  if (!s.future.length) return;
  const next = s.future[0];
  modelStore.set({ model: next, past: [...s.past, s.model], future: s.future.slice(1) });
  scheduleSave();
  fixUiAfterModelChange();
}

export function replaceModel(m: Model) {
  modelStore.set({ model: normalized(m), past: [], future: [] });
  scheduleSave();
  uiStore.set({ ...uiStore.get(), diagramId: m.rootDiagramId, selection: null, tool: 'select' });
}

export function useModel(): Model {
  return useSyncExternalStore(modelStore.subscribe, () => modelStore.get().model);
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const s = useSyncExternalStore(modelStore.subscribe, () => modelStore.get());
  return { canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}

// ---------------------------------------------------------------- Стан інтерфейсу

export type Tool =
  | 'select'
  | 'box'
  | 'arrow'
  | 'uob'
  | 'link'
  | 'referent'
  | `junction:${JunctionType}:${'sync' | 'async'}`;

export interface UiState {
  diagramId: Id;
  selection: Selection | null;
  tool: Tool;
  zoom: number;
  toast: { text: string; kind: 'info' | 'warn' | 'error'; id: number } | null;
  dialog: null | 'reports' | 'abc' | 'decompose' | 'about';
  decomposeBoxId?: Id;
}

export const uiStore = createStore<UiState>({
  diagramId: initialModel.rootDiagramId,
  selection: null,
  tool: 'select',
  zoom: 1,
  toast: null,
  dialog: null,
});

export function useUi(): UiState {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get);
}

export function setUi(patch: Partial<UiState>) {
  uiStore.set({ ...uiStore.get(), ...patch });
}

export function select(kind: ElementKind, id: Id) {
  setUi({ selection: { kind, id } });
}

let toastCounter = 0;
export function toast(text: string, kind: 'info' | 'warn' | 'error' = 'info') {
  toastCounter += 1;
  const id = toastCounter;
  setUi({ toast: { text, kind, id } });
  setTimeout(() => {
    if (uiStore.get().toast?.id === id) setUi({ toast: null });
  }, 3500);
}

export function openDiagram(id: Id) {
  setUi({ diagramId: id, selection: null, tool: 'select' });
}

function fixUiAfterModelChange() {
  const m = getModel();
  const ui = uiStore.get();
  let { diagramId, selection } = ui;
  if (diagramId !== NODE_TREE_ID && !m.diagrams[diagramId]) {
    diagramId = m.rootDiagramId;
    selection = null;
  }
  if (selection && diagramId !== NODE_TREE_ID) {
    const d = m.diagrams[diagramId];
    const exists =
      d.boxes.some((b) => b.id === selection!.id) ||
      (d.kind === 'idef0' && d.arrows.some((a) => a.id === selection!.id)) ||
      (d.kind === 'idef3' && (d.junctions.some((j) => j.id === selection!.id) || d.referents.some((r) => r.id === selection!.id) || d.links.some((l) => l.id === selection!.id)));
    if (!exists) selection = null;
  }
  if (diagramId !== ui.diagramId || selection !== ui.selection) setUi({ diagramId, selection });
}

modelStore.subscribe(fixUiAfterModelChange);
