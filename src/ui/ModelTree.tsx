import { boxNumber, diagramLabel } from '../model/queries';
import type { Id, Model } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { setUi, useModel, useUi } from '../store/store';

function DiagramItem({ model, id, depth, current }: { model: Model; id: Id; depth: number; current: Id }) {
  const d = model.diagrams[id];
  if (!d) return null;
  const children = d.boxes.filter((b) => b.childDiagramId && model.diagrams[b.childDiagramId]);
  return (
    <li>
      <button
        className={`tree-item ${current === id ? 'active' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setUi({ diagramId: id, selection: null })}
        data-testid={`tree-${diagramLabel(model, id).split(' ')[0]}`}
        title={diagramLabel(model, id)}
      >
        <span className={`tree-kind ${d.kind}`}>{d.kind === 'idef3' ? '3' : '0'}</span>
        <span className="tree-text">{diagramLabel(model, id)}</span>
      </button>
      {d.boxes.length > 0 && (
        <ul className="tree-boxes">
          {d.boxes.map((b) => (
            <li key={b.id}>
              <button
                className="tree-box"
                style={{ paddingLeft: 26 + depth * 14 }}
                onClick={() => setUi({ diagramId: id, selection: { kind: 'box', id: b.id } })}
                title={b.name}
              >
                <span className="num">{boxNumber(model, b.id)}</span> {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {children.length > 0 && (
        <ul>
          {children.map((b) => (
            <DiagramItem key={b.childDiagramId} model={model} id={b.childDiagramId!} depth={depth + 1} current={current} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ModelTree() {
  const model = useModel();
  const ui = useUi();
  return (
    <aside className="panel panel-left" data-testid="model-tree">
      <div className="panel-title">Дерево моделі</div>
      <button className="tree-root" onClick={() => setUi({ selection: null })} title="Властивості моделі">
        <span className="tree-model-icon">◆</span> {model.name || 'Без назви'}
      </button>
      <ul className="tree">
        <DiagramItem model={model} id={model.rootDiagramId} depth={0} current={ui.diagramId} />
        <li>
          <button
            className={`tree-item ${ui.diagramId === NODE_TREE_ID ? 'active' : ''}`}
            style={{ paddingLeft: 10 }}
            onClick={() => setUi({ diagramId: NODE_TREE_ID, selection: null })}
            data-testid="tree-node-tree"
          >
            <span className="tree-kind tree">▲</span>
            <span className="tree-text">Дерево вузлів</span>
          </button>
        </li>
      </ul>
      <div className="legend">
        <p><b>Підказки</b></p>
        <p>Подвійний клік по блоку — декомпозиція або перехід на дочірню діаграму.</p>
        <p>Стрілка: інструмент «Стрілка», клік на джерело, потім на призначення. Клік у порожнє місце — межа діаграми.</p>
        <p>Delete — видалити, Ctrl+Z / Ctrl+Y — скасувати / повторити.</p>
      </div>
    </aside>
  );
}
