import { getLayout } from '../geometry/layout';
import { autoLayout } from '../model/ops';
import type { Model } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { commit, setUi, useModel, useUi, type Tool } from '../store/store';
import { fitZoom } from './Canvas';

interface ToolDef {
  tool: Tool;
  label: string;
  title: string;
  icon: string;
}

const IDEF0_TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Вибір', title: 'Вибір і переміщення (Esc)', icon: '↖' },
  { tool: 'box', label: 'Блок', title: 'Додати блок (клік на полотні)', icon: '▭' },
  { tool: 'arrow', label: 'Стрілка', title: 'Стрілка: клік на джерело, потім на призначення', icon: '→' },
];

const IDEF3_TOOLS: ToolDef[] = [
  { tool: 'select', label: 'Вибір', title: 'Вибір і переміщення (Esc)', icon: '↖' },
  { tool: 'uob', label: 'UOB', title: 'Одиниця роботи (UOB)', icon: '▭' },
  { tool: 'link', label: "Зв'язок", title: "Зв'язок передування: клік на джерело, потім на призначення", icon: '→' },
  { tool: 'referent', label: 'Посилання', title: "Об'єкт-посилання", icon: '▢' },
  { tool: 'junction:and:async', label: '&', title: 'Перехрестя: асинхронне І (&)', icon: '&' },
  { tool: 'junction:and:sync', label: '&║', title: 'Перехрестя: синхронне І (&)', icon: '&' },
  { tool: 'junction:xor:async', label: 'X', title: 'Перехрестя: виключне АБО (X)', icon: 'X' },
  { tool: 'junction:or:async', label: 'O', title: 'Перехрестя: асинхронне АБО (O)', icon: 'O' },
  { tool: 'junction:or:sync', label: 'O║', title: 'Перехрестя: синхронне АБО (O)', icon: 'O' },
];

export function Toolbar() {
  const model = useModel();
  const ui = useUi();
  const isTree = ui.diagramId === NODE_TREE_ID;
  const d = isTree ? null : model.diagrams[ui.diagramId];
  const tools = !d ? [] : d.kind === 'idef0' ? IDEF0_TOOLS : IDEF3_TOOLS;
  const isCtx = ui.diagramId === model.rootDiagramId;
  const layout = getLayout(model, ui.diagramId);
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="tool-group">
        {tools.map((t) => (
          <button
            key={t.tool}
            className={`tool ${ui.tool === t.tool ? 'active' : ''}`}
            title={t.title}
            data-testid={`tool-${t.tool}`}
            disabled={t.tool === 'box' && isCtx}
            onClick={() => setUi({ tool: t.tool })}
          >
            {t.tool.startsWith('junction') ? <span className="j-icon">{t.label}</span> : (
              <>
                <span className="tool-icon">{t.icon}</span>
                {t.label}
              </>
            )}
          </button>
        ))}
        {d && !isCtx && (
          <button className="tool" title="Розташувати блоки за замовчуванням" data-testid="auto-layout" onClick={() => commit((m) => autoLayout(m as Model, ui.diagramId))}>
            {d.kind === 'idef0' ? '⤡ Сходинками' : '⇥ У ряд'}
          </button>
        )}
      </div>
      <div className="tool-group">
        <button className="tool" title="Зменшити" onClick={() => setUi({ zoom: Math.max(0.3, Math.round((ui.zoom - 0.1) * 10) / 10) })}>−</button>
        <span className="zoom-label" data-testid="zoom">{Math.round(ui.zoom * 100)}%</span>
        <button className="tool" title="Збільшити" onClick={() => setUi({ zoom: Math.min(3, Math.round((ui.zoom + 0.1) * 10) / 10) })}>+</button>
        <button className="tool" title="Вмістити діаграму у вікно" onClick={() => fitZoom()}>Вмістити</button>
      </div>
      {layout && layout.warnings.length > 0 && (
        <div className="toolbar-warn" data-testid="diagram-warning" title={layout.warnings.join('\n')}>
          ⚠ {layout.warnings[0]}
        </div>
      )}
    </div>
  );
}
