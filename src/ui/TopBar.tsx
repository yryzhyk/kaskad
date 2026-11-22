import { useRef, useState } from 'react';
import { exportAllPng, exportDiagramPng, exportDiagramSvg } from '../export/png';
import { commit, getModel, redo, setUi, toast, undo, useHistory, useModel, useUi } from '../store/store';
import { loadSample, newModel, openFromFile, saveToFile } from './actions';

export function TopBar() {
  const model = useModel();
  const ui = useUi();
  const { canUndo, canRedo } = useHistory();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(`Помилка: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#1d4ed8" />
          <rect x="5" y="6" width="10" height="7" fill="none" stroke="#fff" strokeWidth="2" />
          <rect x="11" y="13" width="10" height="7" fill="none" stroke="#fff" strokeWidth="2" />
          <rect x="17" y="20" width="10" height="7" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
        <span className="brand-name">Kaskad</span>
        <span className="brand-model" title={model.name}>{model.name}</span>
      </div>
      <nav className="menu">
        <button className="mbtn" onClick={newModel} data-testid="btn-new">Нова</button>
        <button className="mbtn" onClick={() => fileRef.current?.click()} data-testid="btn-open">Відкрити</button>
        <button className="mbtn" onClick={saveToFile} data-testid="btn-save" title="Зберегти модель у файл .json (Ctrl+S)">Зберегти</button>
        <button className="mbtn" onClick={loadSample} data-testid="btn-sample">Приклад</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openFromFile(f);
            e.target.value = '';
          }}
        />
        <span className="sep" />
        <button className="mbtn icon" onClick={undo} disabled={!canUndo} title="Скасувати (Ctrl+Z)" data-testid="btn-undo">↶</button>
        <button className="mbtn icon" onClick={redo} disabled={!canRedo} title="Повторити (Ctrl+Y)" data-testid="btn-redo">↷</button>
        <span className="sep" />
        <button className="mbtn" disabled={!!busy} onClick={() => run('png', () => exportDiagramPng(getModel(), ui.diagramId))} data-testid="btn-export-png" title="Поточна діаграма у PNG (3360×2376, біле тло)">
          {busy === 'png' ? 'Експорт…' : 'PNG'}
        </button>
        <button className="mbtn" disabled={!!busy} onClick={() => run('svg', () => exportDiagramSvg(getModel(), ui.diagramId))} data-testid="btn-export-svg" title="Поточна діаграма у SVG">
          SVG
        </button>
        <button className="mbtn" disabled={!!busy} onClick={() => run('all', () => exportAllPng(getModel()))} data-testid="btn-export-all" title="Усі діаграми — ZIP з PNG">
          {busy === 'all' ? 'Експорт…' : 'Усі діаграми'}
        </button>
        <span className="sep" />
        <button className="mbtn" onClick={() => setUi({ dialog: 'reports' })} data-testid="btn-reports">Звіти</button>
        <button className="mbtn" onClick={() => setUi({ dialog: 'abc' })} data-testid="btn-abc">ABC</button>
        <label className="mcheck" title="Показувати вартість у лівому нижньому куті блоків">
          <input type="checkbox" checked={model.abc.showCost} data-testid="toggle-cost" onChange={(e) => commit((m) => void (m.abc.showCost = e.target.checked))} />
          <span>
            Вартість<span className="long"> на блоках</span>
          </span>
        </label>
      </nav>
    </header>
  );
}
