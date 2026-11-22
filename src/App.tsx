import { useEffect } from 'react';
import { Canvas } from './ui/Canvas';
import { Dialogs } from './ui/Dialogs';
import { ModelTree } from './ui/ModelTree';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';
import { deleteSelection, saveToFile } from './ui/actions';
import { redo, undo, useUi } from './store/store';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

export function App() {
  const ui = useUi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && (k === 'z' || k === 'я') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (ctrl && ((k === 'y' || k === 'н') || ((k === 'z' || k === 'я') && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (ctrl && (k === 's' || k === 'і')) {
        e.preventDefault();
        saveToFile();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <ModelTree />
        <main className="center">
          <Toolbar />
          <Canvas />
        </main>
        <PropertiesPanel />
      </div>
      <Dialogs />
      {ui.toast && (
        <div className={`toast toast-${ui.toast.kind}`} role="status" data-testid="toast">
          {ui.toast.text}
        </div>
      )}
    </div>
  );
}
