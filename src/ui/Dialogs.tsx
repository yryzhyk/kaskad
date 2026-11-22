import { useEffect, useMemo, useState } from 'react';
import { downloadBlob, safeFileName } from '../export/download';
import { copyReport, reportToCsv } from '../export/table';
import { newId } from '../model/factory';
import { activitySubtree, boxNumber, findBox } from '../model/queries';
import { buildReport, REPORT_TABS, type ReportKind } from '../model/reports';
import type { Id } from '../model/types';
import { commit, setUi, toast, useModel, useUi } from '../store/store';
import { doDecompose } from './actions';
import { TextField } from './fields';

function Modal({ title, onClose, children, wide, testId }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; testId?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-label={title} data-testid={testId}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрити" data-testid="modal-close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Dialogs() {
  const ui = useUi();
  const close = () => setUi({ dialog: null });
  if (ui.dialog === 'decompose' && ui.decomposeBoxId) return <DecomposeDialog boxId={ui.decomposeBoxId} onClose={close} />;
  if (ui.dialog === 'abc') return <AbcDialog onClose={close} />;
  if (ui.dialog === 'reports') return <ReportsDialog onClose={close} />;
  return null;
}

function DecomposeDialog({ boxId, onClose }: { boxId: Id; onClose: () => void }) {
  const model = useModel();
  const loc = findBox(model, boxId);
  const isUob = loc?.diagram.kind === 'idef3';
  const [kind, setKind] = useState<'idef0' | 'idef3'>(isUob ? 'idef3' : 'idef0');
  const [count, setCount] = useState(3);
  if (!loc) return null;
  const warn = kind === 'idef0' && (count < 3 || count > 6);
  return (
    <Modal title="Декомпозиція роботи" onClose={onClose} testId="decompose-dialog">
      <p>
        Робота <b>{boxNumber(model, boxId)}</b> «{loc.box.name}»
      </p>
      <div className="radio-row">
        <label className={`radio-card ${kind === 'idef0' ? 'active' : ''} ${isUob ? 'disabled' : ''}`}>
          <input type="radio" name="kind" checked={kind === 'idef0'} disabled={isUob} onChange={() => setKind('idef0')} data-testid="decomp-idef0" />
          <b>IDEF0</b>
          <span>Функціональна модель: блоки та стрілки ICOM</span>
        </label>
        <label className={`radio-card ${kind === 'idef3' ? 'active' : ''}`}>
          <input type="radio" name="kind" checked={kind === 'idef3'} onChange={() => setKind('idef3')} data-testid="decomp-idef3" />
          <b>IDEF3</b>
          <span>Опис процесу: одиниці роботи, перехрестя, зв'язки</span>
        </label>
      </div>
      <label className="field">
        <span className="field-label">{kind === 'idef0' ? 'Кількість блоків (рекомендовано 3–6)' : 'Кількість одиниць роботи (UOB)'}</span>
        <input type="number" min={1} max={12} value={count} data-testid="decomp-count" onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
      </label>
      {warn && <div className="warn-box" data-testid="decomp-warning">⚠ За стандартом IDEF0 діаграма декомпозиції має містити від 3 до 6 блоків.</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Скасувати</button>
        <button className="btn btn-primary" data-testid="decomp-ok" onClick={() => doDecompose(boxId, kind, count)}>
          Створити діаграму
        </button>
      </div>
    </Modal>
  );
}

function AbcDialog({ onClose }: { onClose: () => void }) {
  const model = useModel();
  return (
    <Modal title="Функціонально-вартісний аналіз (ABC)" onClose={onClose} testId="abc-dialog">
      <div className="grid-2">
        <TextField label="Одиниця вартості" value={model.abc.currency} testId="abc-currency" onChange={(v) => commit((m) => void (m.abc.currency = v))} />
        <TextField label="Одиниця часу" value={model.abc.timeUnit} testId="abc-timeunit" onChange={(v) => commit((m) => void (m.abc.timeUnit = v))} />
      </div>
      <label className="check">
        <input type="checkbox" checked={model.abc.showCost} onChange={(e) => commit((m) => void (m.abc.showCost = e.target.checked))} />
        Показувати вартість на блоках (лівий нижній кут)
      </label>
      <h3 className="sub">Центри витрат</h3>
      <table className="cc-table">
        <thead>
          <tr>
            <th>Назва</th>
            <th>Визначення</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {model.costCenters.map((cc, i) => (
            <tr key={cc.id}>
              <td>
                <TextField label="" value={cc.name} testId={`cc-name-${i}`} onChange={(v) => commit((m) => void (m.costCenters[i].name = v))} />
              </td>
              <td>
                <TextField label="" value={cc.definition} testId={`cc-def-${i}`} onChange={(v) => commit((m) => void (m.costCenters[i].definition = v))} />
              </td>
              <td>
                <button
                  className="icon-btn danger"
                  title="Видалити центр витрат"
                  onClick={() => {
                    if (window.confirm(`Видалити центр витрат «${cc.name}»? Введені вартості по ньому буде втрачено.`))
                      commit((m) => {
                        m.costCenters.splice(i, 1);
                        for (const d of Object.values(m.diagrams)) for (const b of d.boxes) delete b.abc.costs[cc.id];
                      });
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn"
        data-testid="cc-add"
        onClick={() => commit((m) => void m.costCenters.push({ id: newId('cc'), name: `Центр витрат ${m.costCenters.length + 1}`, definition: '' }))}
      >
        + Додати центр витрат
      </button>
      <p className="hint">
        Для робіт без декомпозиції вартість по центрах, тривалість і частота задаються на панелі властивостей. Для декомпозованих робіт (IDEF0 або IDEF3)
        вартість і тривалість обчислюються автоматично: сума (значення дочірньої роботи × її частота).
      </p>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>Готово</button>
      </div>
    </Modal>
  );
}

function ReportsDialog({ onClose }: { onClose: () => void }) {
  const model = useModel();
  const [kind, setKind] = useState<ReportKind>('model');
  const [scope, setScope] = useState<string>('');
  const activities = useMemo(() => activitySubtree(model), [model]);
  const validScope = scope && findBox(model, scope) ? scope : undefined;
  const report = useMemo(() => buildReport(model, kind, validScope), [model, kind, validScope]);
  return (
    <Modal title="Звіти" onClose={onClose} wide testId="reports-dialog">
      <div className="report-controls">
        <div className="tabs">
          {(Object.keys(REPORT_TABS) as ReportKind[]).map((k) => (
            <button key={k} className={`tab ${kind === k ? 'active' : ''}`} data-testid={`report-${k}`} onClick={() => setKind(k)}>
              {REPORT_TABS[k]}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span className="field-label">Обсяг</span>
          <select value={validScope ?? ''} onChange={(e) => setScope(e.target.value)} data-testid="report-scope" disabled={kind === 'costCenters'}>
            <option value="">Вся модель</option>
            {activities.map((a) => (
              <option key={a.box.id} value={a.box.id}>
                {'  '.repeat(a.depth)}
                {boxNumber(model, a.box.id)} {a.box.name}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <button
          className="btn"
          data-testid="report-copy"
          onClick={async () => {
            const ok = await copyReport(report);
            toast(ok ? 'Таблицю скопійовано. Вставте її у Word (Ctrl+V).' : 'Не вдалося скопіювати таблицю.', ok ? 'info' : 'error');
          }}
        >
          Копіювати для Word
        </button>
        <button
          className="btn btn-primary"
          data-testid="report-csv"
          onClick={() => downloadBlob(new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(report.title)}.csv`)}
        >
          Експорт CSV
        </button>
      </div>
      <div className="report" data-testid="report-view">
        <h3>{report.title}</h3>
        <p className="report-scope" data-testid="report-scope-label">{report.scope}</p>
        {report.sections.map((s, i) => (
          <div key={i} className="report-section">
            {s.caption && <p className="report-caption">{s.caption}</p>}
            {s.exportColumns && (
              <p className="report-export-note" data-testid="report-export-note">
                У «Копіювати для Word» і CSV потрапляють лише колонки таблиці {kind === 'activities' ? '2.6' : '2.7'} методички:{' '}
                {s.exportColumns.map((c) => `«${c.title}»`).join(', ')}.
              </p>
            )}
            <table className="report-table" data-testid={`report-table-${i}`}>
              <thead>
                <tr>
                  {s.columns.map((c, j) => (
                    <th key={j}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.length === 0 && (
                  <tr>
                    <td colSpan={s.columns.length} className="empty">Немає даних</td>
                  </tr>
                )}
                {s.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => {
                      const indent = (c.match(/^ */)?.[0].length ?? 0) / 4;
                      return (
                        <td key={k} className={s.numeric?.includes(k) ? 'num' : ''} style={indent ? { paddingLeft: 8 + indent * 16 } : undefined}>
                          {c.trim()}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}
