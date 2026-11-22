import type { Draft } from 'immer';
import { abcOf, formatMoney, formatNumber } from '../model/abc';
import { arrowEffectiveLabel, getLayout, icomCode } from '../geometry/layout';
import { addBorderArrow, removeDecomposition, reorderBox } from '../model/ops';
import { boxNumber, diagramKindLabel, diagramNode, diagramPageNumber, diagramTitle, findBox, isContext } from '../model/queries';
import type { Arrow, Box, Endpoint, Id, Idef0Diagram, Idef3Diagram, JunctionType, LinkKind, Model } from '../model/types';
import { NODE_TREE_ID } from '../model/types';
import { commit, select, setUi, useModel, useUi } from '../store/store';
import { deleteSelection, openDecompose } from './actions';
import { NumberField, TextField } from './fields';

export function PropertiesPanel() {
  const model = useModel();
  const ui = useUi();
  const sel = ui.selection;
  const d = ui.diagramId === NODE_TREE_ID ? null : model.diagrams[ui.diagramId];
  let content: React.ReactNode = null;
  if (sel && d) {
    if (sel.kind === 'box') {
      const box = d.boxes.find((b) => b.id === sel.id);
      if (box) content = <BoxProps model={model} diagramId={d.id} box={box} />;
    } else if (sel.kind === 'arrow' && d.kind === 'idef0') {
      const a = d.arrows.find((x) => x.id === sel.id);
      if (a) content = <ArrowProps model={model} diagram={d} arrow={a} />;
    } else if (d.kind === 'idef3') {
      if (sel.kind === 'junction') {
        const j = d.junctions.find((x) => x.id === sel.id);
        if (j) content = <JunctionProps diagram={d} id={j.id} />;
      } else if (sel.kind === 'referent') {
        const r = d.referents.find((x) => x.id === sel.id);
        if (r) content = <ReferentProps diagram={d} id={r.id} />;
      } else if (sel.kind === 'link') {
        const l = d.links.find((x) => x.id === sel.id);
        if (l) content = <LinkProps model={model} diagram={d} id={l.id} />;
      }
    }
  }
  if (!content) content = <DiagramAndModelProps model={model} diagramId={ui.diagramId} />;
  return (
    <aside className="panel panel-right" data-testid="properties">
      {content}
    </aside>
  );
}

function updateDiagram(diagramId: Id, fn: (d: Draft<Model>['diagrams'][string]) => void) {
  commit((m) => {
    const d = m.diagrams[diagramId];
    if (d) fn(d);
  });
}

function updateBox(boxId: Id, fn: (b: Draft<Box>) => void) {
  commit((m) => {
    for (const d of Object.values(m.diagrams)) {
      const b = d.boxes.find((x) => x.id === boxId);
      if (b) fn(b);
    }
  });
}

function BoxProps({ model, diagramId, box }: { model: Model; diagramId: Id; box: Box }) {
  const d = model.diagrams[diagramId];
  const number = boxNumber(model, box.id);
  const isUob = d.kind === 'idef3';
  const ctx = isContext(model, diagramId);
  const index = d.boxes.findIndex((b) => b.id === box.id);
  const child = box.childDiagramId ? model.diagrams[box.childDiagramId] : undefined;
  const abc = abcOf(model, box);
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">{isUob ? 'UOB' : 'Робота'}</span>
        <h3 data-testid="prop-number">{number}</h3>
      </div>
      <TextField label="Назва" value={box.name} multiline rows={2} testId="prop-name" onChange={(v) => updateBox(box.id, (b) => void (b.name = v))} />
      <TextField label="Визначення" value={box.definition} multiline rows={4} testId="prop-definition" onChange={(v) => updateBox(box.id, (b) => void (b.definition = v))} />
      {isUob && <TextField label="Посилання (права клітинка смуги)" value={box.ref ?? ''} onChange={(v) => updateBox(box.id, (b) => void (b.ref = v))} />}
      {!ctx && !isUob && (
        <label className="field">
          <span className="field-label">Порядковий номер на діаграмі</span>
          <select
            value={index}
            data-testid="prop-order"
            onChange={(e) => commit((m) => reorderBox(m as Model, diagramId, box.id, Number(e.target.value)))}
          >
            {d.boxes.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      <section className="props-section">
        <h4>Декомпозиція</h4>
        {child ? (
          <div className="btn-col">
            <button className="btn" data-testid="open-child" onClick={() => setUi({ diagramId: child.id, selection: null })}>
              Відкрити дочірню діаграму {diagramNode(model, child.id)} ({child.kind === 'idef3' ? 'IDEF3' : 'IDEF0'})
            </button>
            <button
              className="btn btn-ghost danger"
              onClick={() => {
                if (window.confirm('Видалити декомпозицію разом з усіма дочірніми діаграмами?')) commit((m) => removeDecomposition(m as Model, box.id));
              }}
            >
              Видалити декомпозицію
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" data-testid="decompose" onClick={() => openDecompose(box.id)}>
            Декомпозувати…
          </button>
        )}
      </section>
      {!isUob && (
        <section className="props-section">
          <h4>Додати граничну стрілку</h4>
          <div className="btn-grid">
            {(
              [
                ['input', 'Вхід'],
                ['control', 'Управління'],
                ['output', 'Вихід'],
                ['mechanism', 'Механізм'],
              ] as const
            ).map(([role, label]) => (
              <button
                key={role}
                className="btn btn-small"
                data-testid={`add-${role}`}
                onClick={() => {
                  let id: Id | undefined;
                  commit((m) => {
                    id = addBorderArrow(m as Model, diagramId, box.id, role, label).id;
                  });
                  if (id) select('arrow', id);
                }}
              >
                + {label}
              </button>
            ))}
          </div>
          {!ctx && <p className="hint">На дочірній діаграмі нова гранична стрілка позначається як тунельована «( )».</p>}
        </section>
      )}
      <AbcSection model={model} box={box} abc={abc} />
      <div className="props-footer">
        {!ctx && (
          <button className="btn btn-ghost danger" data-testid="delete-selection" onClick={deleteSelection}>
            Видалити
          </button>
        )}
      </div>
    </div>
  );
}

function AbcSection({ model, box, abc }: { model: Model; box: Box; abc: ReturnType<typeof abcOf> }) {
  const cur = model.abc.currency;
  return (
    <section className="props-section" data-testid="abc-section">
      <h4>
        ABC <button className="link-btn" onClick={() => setUi({ dialog: 'abc' })}>налаштування</button>
      </h4>
      {model.costCenters.length === 0 && <p className="hint">Додайте центри витрат у налаштуваннях ABC.</p>}
      {abc.computed ? (
        <>
          <p className="hint">Робота декомпозована: вартість і тривалість обчислено як сума (значення дочірньої × частота дочірньої).</p>
          <table className="mini-table">
            <tbody>
              {model.costCenters.map((cc) => (
                <tr key={cc.id}>
                  <td>{cc.name}</td>
                  <td className="num">{formatNumber(abc.costs[cc.id] ?? 0)} {cur}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Разом</td>
                <td className="num" data-testid="abc-total">{formatMoney(model, abc.total)}</td>
              </tr>
              <tr>
                <td>Тривалість</td>
                <td className="num" data-testid="abc-duration">{formatNumber(abc.duration, 3)} {model.abc.timeUnit}</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <>
          {model.costCenters.map((cc) => (
            <NumberField
              key={cc.id}
              label={cc.name}
              suffix={cur}
              value={box.abc.costs[cc.id] ?? 0}
              testId={`abc-cost-${cc.name}`}
              onChange={(v) => updateBox(box.id, (b) => void (b.abc.costs[cc.id] = v))}
            />
          ))}
          <div className="abc-total-row">
            Разом: <b data-testid="abc-total">{formatMoney(model, abc.total)}</b>
          </div>
          <NumberField label="Тривалість" suffix={model.abc.timeUnit} value={box.abc.duration} min={0} testId="abc-duration-input" onChange={(v) => updateBox(box.id, (b) => void (b.abc.duration = v))} />
        </>
      )}
      <NumberField label="Частота" value={box.abc.frequency} min={0} testId="abc-frequency" onChange={(v) => updateBox(box.id, (b) => void (b.abc.frequency = v))} />
    </section>
  );
}

const ROLE_UA = { input: 'вхід', control: 'управління', output: 'вихід', mechanism: 'механізм' } as const;

function describe(model: Model, d: Idef0Diagram, e: Endpoint, isSource: boolean): string {
  switch (e.kind) {
    case 'box':
      return `${boxNumber(model, e.boxId)} ${findBox(model, e.boxId)?.box.name ?? ''} (${isSource ? 'вихід' : ROLE_UA[e.role]})`;
    case 'border': {
      const code = icomCode(model, d, e);
      return isContext(model, d.id) ? 'Межа діаграми (зовнішнє середовище)' : `Межа діаграми${code ? ` — ${code}` : e.parentArrowId ? '' : ' (тунель)'}`;
    }
    case 'arrow': {
      const a = d.arrows.find((x) => x.id === e.arrowId);
      return `${isSource ? 'Розгалуження' : 'Злиття'}: «${a ? arrowEffectiveLabel(model, d, a) : ''}»`;
    }
    case 'point':
      return 'Не під\'єднано';
  }
}

function ArrowProps({ model, diagram, arrow }: { model: Model; diagram: Idef0Diagram; arrow: Arrow }) {
  const linked = [arrow.source, arrow.target].find((e) => e.kind === 'border' && !!e.parentArrowId) as Extract<Endpoint, { kind: 'border' }> | undefined;
  const parentDiagramId = diagram.parentBoxId ? findBox(model, diagram.parentBoxId)?.diagram.id : undefined;
  const code = linked ? icomCode(model, diagram, linked) : '';
  const parentArrow = linked && parentDiagramId ? (model.diagrams[parentDiagramId] as Idef0Diagram).arrows.find((a) => a.id === linked.parentArrowId) : undefined;
  const target = parentArrow ? { diagramId: parentDiagramId!, id: parentArrow.id } : { diagramId: diagram.id, id: arrow.id };
  const shown = parentArrow ?? arrow;
  const upd = (fn: (a: Draft<Arrow>) => void) =>
    updateDiagram(target.diagramId, (d) => {
      if (d.kind !== 'idef0') return;
      const a = d.arrows.find((x) => x.id === target.id);
      if (a) fn(a);
    });
  const updLocal = (fn: (a: Draft<Arrow>) => void) =>
    updateDiagram(diagram.id, (d) => {
      if (d.kind !== 'idef0') return;
      const a = d.arrows.find((x) => x.id === arrow.id);
      if (a) fn(a);
    });
  const layout = getLayout(model, diagram.id);
  const effective = layout?.arrows.find((a) => a.id === arrow.id)?.effectiveLabel ?? '';
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">Стрілка</span>
        <h3>{code || (arrow.source.kind === 'arrow' ? 'Гілка' : arrow.target.kind === 'arrow' ? 'Злиття' : '')}</h3>
      </div>
      {linked && <p className="hint">Гранична стрілка {code}: назва і визначення спільні зі стрілкою батьківської діаграми.</p>}
      <TextField label="Назва" value={shown.label} multiline rows={2} testId="prop-arrow-label" placeholder={effective && !shown.label ? effective : ''} onChange={(v) => upd((a) => void (a.label = v))} />
      <TextField label="Визначення" value={shown.definition} multiline rows={4} testId="prop-arrow-definition" onChange={(v) => upd((a) => void (a.definition = v))} />
      <section className="props-section">
        <h4>З'єднання</h4>
        <dl className="kv">
          <dt>Джерело</dt>
          <dd data-testid="arrow-source">{describe(model, diagram, arrow.source, true)}</dd>
          <dt>Призначення</dt>
          <dd data-testid="arrow-target">{describe(model, diagram, arrow.target, false)}</dd>
        </dl>
        <p className="hint">Перетягніть кінець вибраної стрілки на інший блок, щоб змінити з'єднання. Сині квадрати переміщують відрізки.</p>
      </section>
      <div className="btn-col">
        <button className="btn btn-small" onClick={() => updLocal((a) => void delete a.labelOffset)}>
          Скинути положення підпису
        </button>
        <button className="btn btn-small" onClick={() => updLocal((a) => void delete a.bend)}>
          Скинути маршрут
        </button>
      </div>
      <div className="props-footer">
        <button className="btn btn-ghost danger" data-testid="delete-selection" onClick={deleteSelection}>
          Видалити
        </button>
      </div>
    </div>
  );
}

function JunctionProps({ diagram, id }: { diagram: Idef3Diagram; id: Id }) {
  const j = diagram.junctions.find((x) => x.id === id)!;
  const upd = (fn: (x: Draft<Idef3Diagram['junctions'][number]>) => void) =>
    updateDiagram(diagram.id, (d) => {
      if (d.kind !== 'idef3') return;
      const x = d.junctions.find((q) => q.id === id);
      if (x) fn(x);
    });
  const fan = (() => {
    const inc = diagram.links.filter((l) => l.to === id && l.kind !== 'relational').length;
    const out = diagram.links.filter((l) => l.from === id && l.kind !== 'relational').length;
    if (out > 1 && inc <= 1) return 'розгалуження (fan-out)';
    if (inc > 1 && out <= 1) return 'злиття (fan-in)';
    if (inc > 1 && out > 1) return 'розгалуження і злиття';
    return 'не визначено (додайте зв\'язки)';
  })();
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">Перехрестя</span>
        <h3>J{j.num}</h3>
      </div>
      <label className="field">
        <span className="field-label">Тип</span>
        <select value={j.type} data-testid="junction-type" onChange={(e) => upd((x) => {
          x.type = e.target.value as JunctionType;
          if (x.type === 'xor') x.sync = false;
        })}>
          <option value="and">& — І (AND)</option>
          <option value="xor">X — виключне АБО (XOR)</option>
          <option value="or">O — АБО (OR)</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={j.sync} disabled={j.type === 'xor'} data-testid="junction-sync" onChange={(e) => upd((x) => void (x.sync = e.target.checked))} />
        Синхронне {j.type === 'xor' && <span className="hint">(для X не застосовується)</span>}
      </label>
      <p className="hint">Вид: <b>{fan}</b></p>
      <TextField label="Визначення" value={j.definition} multiline rows={3} onChange={(v) => upd((x) => void (x.definition = v))} />
      <div className="props-footer">
        <button className="btn btn-ghost danger" data-testid="delete-selection" onClick={deleteSelection}>
          Видалити
        </button>
      </div>
    </div>
  );
}

function ReferentProps({ diagram, id }: { diagram: Idef3Diagram; id: Id }) {
  const r = diagram.referents.find((x) => x.id === id)!;
  const upd = (fn: (x: Draft<Idef3Diagram['referents'][number]>) => void) =>
    updateDiagram(diagram.id, (d) => {
      if (d.kind !== 'idef3') return;
      const x = d.referents.find((q) => q.id === id);
      if (x) fn(x);
    });
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">Об'єкт-посилання</span>
      </div>
      <TextField label="Назва" value={r.name} testId="prop-name" onChange={(v) => upd((x) => void (x.name = v))} />
      <TextField label="Визначення" value={r.definition} multiline rows={3} testId="prop-definition" onChange={(v) => upd((x) => void (x.definition = v))} />
      <div className="props-footer">
        <button className="btn btn-ghost danger" data-testid="delete-selection" onClick={deleteSelection}>
          Видалити
        </button>
      </div>
    </div>
  );
}

function LinkProps({ model, diagram, id }: { model: Model; diagram: Idef3Diagram; id: Id }) {
  const l = diagram.links.find((x) => x.id === id)!;
  const upd = (fn: (x: Draft<Idef3Diagram['links'][number]>) => void) =>
    updateDiagram(diagram.id, (d) => {
      if (d.kind !== 'idef3') return;
      const x = d.links.find((q) => q.id === id);
      if (x) fn(x);
    });
  const name = (nid: Id) => {
    const b = diagram.boxes.find((x) => x.id === nid);
    if (b) return `${boxNumber(model, b.id)} ${b.name}`;
    const j = diagram.junctions.find((x) => x.id === nid);
    if (j) return `J${j.num}`;
    return diagram.referents.find((x) => x.id === nid)?.name ?? '';
  };
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">Зв'язок</span>
      </div>
      <label className="field">
        <span className="field-label">Тип зв'язку</span>
        <select value={l.kind} data-testid="link-kind" onChange={(e) => upd((x) => void (x.kind = e.target.value as LinkKind))}>
          <option value="precedence">Передування (стрілка порядку)</option>
          <option value="relational">Відношення (пунктир)</option>
          <option value="objectFlow">Потік об'єктів (подвійна стрілка)</option>
        </select>
      </label>
      <TextField label="Назва" value={l.label} multiline rows={2} testId="prop-arrow-label" onChange={(v) => upd((x) => void (x.label = v))} />
      <TextField label="Визначення" value={l.definition} multiline rows={3} testId="prop-arrow-definition" onChange={(v) => upd((x) => void (x.definition = v))} />
      <dl className="kv">
        <dt>Від</dt>
        <dd>{name(l.from)}</dd>
        <dt>До</dt>
        <dd>{name(l.to)}</dd>
      </dl>
      <div className="btn-col">
        <button className="btn btn-small" onClick={() => upd((x) => void delete x.labelOffset)}>
          Скинути положення підпису
        </button>
        <button className="btn btn-small" onClick={() => upd((x) => void delete x.bend)}>
          Скинути маршрут
        </button>
      </div>
      <div className="props-footer">
        <button className="btn btn-ghost danger" data-testid="delete-selection" onClick={deleteSelection}>
          Видалити
        </button>
      </div>
    </div>
  );
}

function DiagramAndModelProps({ model, diagramId }: { model: Model; diagramId: Id }) {
  const layout = getLayout(model, diagramId);
  const updModel = (fn: (m: Draft<Model>) => void) => commit(fn);
  return (
    <div className="props">
      <div className="props-head">
        <span className="badge">Діаграма</span>
        <h3>{diagramNode(model, diagramId)}</h3>
      </div>
      <dl className="kv">
        <dt>Назва</dt>
        <dd>{diagramTitle(model, diagramId)}</dd>
        <dt>Тип</dt>
        <dd>{diagramKindLabel(model, diagramId)}</dd>
        <dt>Номер</dt>
        <dd>{diagramPageNumber(model, diagramId)}</dd>
      </dl>
      {layout && layout.warnings.length > 0 && (
        <div className="warn-box">
          {layout.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}
      <section className="props-section">
        <h4>Властивості моделі</h4>
        <TextField label="Назва моделі" value={model.name} testId="model-name" onChange={(v) => updModel((m) => void (m.name = v))} />
        <TextField label="Автор" value={model.author} testId="model-author" onChange={(v) => updModel((m) => void (m.author = v))} />
        <TextField label="Мета (Purpose)" value={model.purpose} multiline rows={3} testId="model-purpose" onChange={(v) => updModel((m) => void (m.purpose = v))} />
        <TextField label="Точка зору (Viewpoint)" value={model.viewpoint} testId="model-viewpoint" onChange={(v) => updModel((m) => void (m.viewpoint = v))} />
        <TextField label="Визначення моделі" value={model.definition} multiline rows={3} onChange={(v) => updModel((m) => void (m.definition = v))} />
      </section>
      <p className="hint">Виберіть блок або стрілку на полотні, щоб редагувати їх властивості.</p>
    </div>
  );
}
