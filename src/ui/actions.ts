import { downloadBlob, safeFileName } from '../export/download';
import { createModel } from '../model/factory';
import { decompose, deleteElement } from '../model/ops';
import { findBox } from '../model/queries';
import type { Id, Model } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { buildSampleModel } from '../model/sample';
import { commit, getModel, parseModel, replaceModel, setUi, toast, uiStore } from '../store/store';

export function openDecompose(boxId: Id) {
  setUi({ dialog: 'decompose', decomposeBoxId: boxId });
}

export function doDecompose(boxId: Id, kind: 'idef0' | 'idef3', count: number) {
  let childId: Id | undefined;
  let message: string | undefined;
  commit((m) => {
    const r = decompose(m as Model, boxId, kind, count);
    childId = r.id;
    message = r.message;
  });
  if (message) toast(message, 'warn');
  if (childId) {
    setUi({ dialog: null, diagramId: childId, selection: null, tool: 'select' });
    if (kind === 'idef0' && (count < 3 || count > 6)) toast('Увага: діаграма декомпозиції IDEF0 має містити від 3 до 6 блоків.', 'warn');
  }
}

export function deleteSelection() {
  const ui = uiStore.get();
  if (!ui.selection || ui.diagramId === NODE_TREE_ID) return;
  const sel = ui.selection;
  const m = getModel();
  if (sel.kind === 'box') {
    const loc = findBox(m, sel.id);
    if (loc?.box.childDiagramId && !window.confirm(`Робота «${loc.box.name}» має декомпозицію. Видалити її разом з усіма дочірніми діаграмами?`)) return;
  }
  let res: { ok: boolean; message?: string } = { ok: false };
  commit((d) => {
    res = deleteElement(d as Model, ui.diagramId, sel);
  });
  if (res.message) toast(res.message, res.ok ? 'info' : 'warn');
  if (res.ok) setUi({ selection: null });
}

export function newModel() {
  if (!window.confirm('Створити нову модель? Поточна чернетка буде замінена (збережіть її у файл, якщо потрібно).')) return;
  replaceModel(createModel());
}

export function loadSample() {
  if (!window.confirm('Відкрити приклад моделі? Поточна чернетка буде замінена.')) return;
  replaceModel(buildSampleModel());
}

export function saveToFile() {
  const m = getModel();
  const blob = new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${safeFileName(m.name)}.json`);
}

export async function openFromFile(file: File) {
  try {
    const text = await file.text();
    replaceModel(parseModel(text));
    toast(`Модель «${getModel().name}» відкрито.`);
  } catch (e) {
    toast(`Не вдалося відкрити файл: ${(e as Error).message}`, 'error');
  }
}
