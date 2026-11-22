import { getLayout, icomCode, arrowEffectiveLabel } from '../geometry/layout';
import { abcOf, formatNumber } from './abc';
import {
  activitySubtree,
  boxNumber,
  diagramKindLabel,
  diagramLabel,
  diagramNode,
  diagramOrder,
  diagramPageNumber,
  diagramSubtree,
  diagramTitle,
  findBox,
} from './queries';
import type { Endpoint, Id, Idef0Diagram, Model } from './types';
import { NODE_TREE_ID } from './types';

export interface ReportSection {
  caption?: string;
  columns: string[];
  rows: string[][];
  /** Колонки з числами (вирівнювання праворуч). */
  numeric?: number[];
  /**
   * Колонки для «Копіювати для Word» і CSV (індекс колонки на екрані + заголовок як у методичці).
   * Якщо не задано — експортуються всі колонки.
   */
  exportColumns?: { index: number; title: string }[];
}

export interface Report {
  title: string;
  scope: string;
  sections: ReportSection[];
}

export type ReportKind = 'model' | 'activities' | 'arrows' | 'costCenters' | 'abc' | 'abcParams';

export const REPORT_TITLES: Record<ReportKind, string> = {
  model: 'Звіт по моделі',
  activities: 'Звіт по роботах',
  arrows: 'Звіт по стрілках',
  costCenters: 'Центри витрат ABC',
  abc: 'Звіт ABC (функціонально-вартісний аналіз)',
  abcParams: 'Параметри робіт ABC',
};

/** Короткі назви вкладок. */
export const REPORT_TABS: Record<ReportKind, string> = {
  model: 'Модель',
  activities: 'Роботи',
  arrows: 'Стрілки',
  costCenters: 'Центри витрат',
  abc: 'ABC',
  abcParams: 'ABC: параметри (по рядках)',
};

function scopeLabel(model: Model, boxId?: Id): string {
  if (!boxId) return 'Вся модель';
  const loc = findBox(model, boxId);
  return loc ? `Робота ${boxNumber(model, boxId)} «${loc.box.name}» з декомпозицією` : 'Вся модель';
}

export function buildReport(model: Model, kind: ReportKind, boxId?: Id): Report {
  const scope = scopeLabel(model, boxId);
  const title = REPORT_TITLES[kind];
  switch (kind) {
    case 'model':
      return { title, scope, sections: modelReport(model, boxId) };
    case 'activities':
      return { title, scope, sections: [activitiesReport(model, boxId)] };
    case 'arrows':
      return { title, scope, sections: [arrowsReport(model, boxId)] };
    case 'costCenters':
      return { title, scope: 'Вся модель', sections: [costCentersReport(model)] };
    case 'abc':
      return { title, scope, sections: [abcReport(model, boxId)] };
    case 'abcParams':
      return { title, scope, sections: [abcParamsReport(model, boxId)] };
  }
}

function modelReport(model: Model, boxId?: Id): ReportSection[] {
  const props: ReportSection = {
    caption: 'Властивості моделі',
    columns: ['Властивість', 'Значення'],
    rows: [
      ['Назва', model.name],
      ['Автор', model.author],
      ['Мета (Purpose)', model.purpose],
      ['Точка зору (Viewpoint)', model.viewpoint],
      ['Визначення', model.definition],
      ['Одиниця вартості', model.abc.currency],
      ['Одиниця часу', model.abc.timeUnit],
      ['Центри витрат', model.costCenters.map((c) => c.name).join(', ')],
    ],
  };
  if (boxId) props.rows.push(['Обсяг звіту', scopeLabel(model, boxId)]);
  const ids = boxId ? diagramSubtree(model, boxId) : diagramOrder(model, true);
  const diagrams: ReportSection = {
    caption: 'Перелік діаграм',
    columns: ['№', 'Вузол', 'Назва', 'Тип', 'Кількість елементів'],
    numeric: [0, 4],
    rows: ids.map((id) => {
      let count = 0;
      if (id === NODE_TREE_ID) count = getLayout(model, id)?.tree?.nodes.length ?? 0;
      else {
        const d = model.diagrams[id];
        count = d.boxes.length + (d.kind === 'idef3' ? d.junctions.length + d.referents.length : 0);
      }
      return [String(diagramPageNumber(model, id)), diagramNode(model, id), diagramTitle(model, id), diagramKindLabel(model, id), String(count)];
    }),
  };
  return [props, diagrams];
}

function activitiesReport(model: Model, boxId?: Id): ReportSection {
  const entries = activitySubtree(model, boxId);
  return {
    columns: ['Номер', 'Назва роботи', 'Визначення', 'Нотація', 'Діаграма'],
    // табл. 2.6 методички: «Ім'я роботи», «Визначення (опис)»
    exportColumns: [
      { index: 1, title: "Ім'я роботи" },
      { index: 2, title: 'Визначення (опис)' },
    ],
    rows: entries.map((e) => [
      boxNumber(model, e.box.id),
      e.box.name,
      e.box.definition,
      e.kind === 'idef0' ? 'IDEF0' : 'IDEF3 (UOB)',
      diagramNode(model, e.diagramId),
    ]),
  };
}

const ROLE_UA = { input: 'Вхід', control: 'Управління', output: 'Вихід', mechanism: 'Механізм' } as const;
const BORDER_ROLE_SRC = { left: 'Вхід', top: 'Управління', bottom: 'Механізм', right: 'Вихід' } as const;
const BORDER_ROLE_TGT = { right: 'Вихід', left: 'Вхід', top: 'Управління', bottom: 'Механізм' } as const;
const LINK_UA = { precedence: 'Зв\'язок IDEF3 (передування)', relational: 'Зв\'язок IDEF3 (відношення)', objectFlow: 'Зв\'язок IDEF3 (потік об\'єктів)' } as const;

function endpointInfo(model: Model, d: Idef0Diagram, e: Endpoint, isSource: boolean): [string, string] {
  switch (e.kind) {
    case 'box': {
      const loc = findBox(model, e.boxId);
      return [`${boxNumber(model, e.boxId)} ${loc?.box.name ?? ''}`, isSource ? 'Вихід' : ROLE_UA[e.role]];
    }
    case 'border': {
      const code = icomCode(model, d, e);
      const where = d.id === model.rootDiagramId ? 'Зовнішнє середовище (межа A-0)' : `Межа діаграми ${diagramNode(model, d.id)}${code ? ` (${code})` : e.parentArrowId ? '' : ' (тунель)'}`;
      return [where, isSource ? BORDER_ROLE_SRC[e.side] : BORDER_ROLE_TGT[e.side]];
    }
    case 'arrow': {
      const a = d.arrows.find((x) => x.id === e.arrowId);
      const name = a ? arrowEffectiveLabel(model, d, a) : '';
      return isSource ? [`Розгалуження стрілки «${name}»`, 'Розгалуження'] : [`Злиття зі стрілкою «${name}»`, 'Злиття'];
    }
    case 'point':
      return ['Не під\'єднано', '—'];
  }
}

function arrowsReport(model: Model, boxId?: Id): ReportSection {
  const rows: string[][] = [];
  const ids = boxId ? diagramSubtree(model, boxId) : diagramOrder(model, false);
  // для обраної роботи — також стрілки, що приєднані до неї на її діаграмі
  if (boxId) {
    const loc = findBox(model, boxId);
    if (loc && loc.diagram.kind === 'idef0') {
      const d = loc.diagram;
      for (const a of d.arrows) {
        const touches = (e: Endpoint) => e.kind === 'box' && e.boxId === boxId;
        if (touches(a.source) || touches(a.target)) rows.push(arrowRow(model, d, a.id));
      }
    } else if (loc && loc.diagram.kind === 'idef3') {
      const d = loc.diagram;
      for (const l of d.links) if (l.from === boxId || l.to === boxId) rows.push(linkRow(model, d.id, l.id));
    }
  }
  for (const id of ids) {
    const d = model.diagrams[id];
    if (!d) continue;
    if (d.kind === 'idef0') for (const a of d.arrows) rows.push(arrowRow(model, d, a.id));
    else for (const l of d.links) rows.push(linkRow(model, d.id, l.id));
  }
  return {
    columns: ['Назва стрілки', 'Джерело', 'Тип джерела', 'Призначення', 'Тип призначення', 'Визначення', 'Діаграма'],
    // табл. 2.7 методички
    exportColumns: [
      { index: 0, title: "Ім'я стрілки" },
      { index: 1, title: 'Джерело стрілки' },
      { index: 2, title: 'Тип джерела стрілки' },
      { index: 3, title: 'Призначення стрілки' },
      { index: 4, title: 'Тип призначення стрілки' },
    ],
    rows,
  };
}

function arrowRow(model: Model, d: Idef0Diagram, arrowId: Id): string[] {
  const a = d.arrows.find((x) => x.id === arrowId)!;
  const [src, srcType] = endpointInfo(model, d, a.source, true);
  const [dst, dstType] = endpointInfo(model, d, a.target, false);
  let definition = a.definition;
  const linked = [a.source, a.target].find((e) => e.kind === 'border' && e.parentArrowId);
  if (linked && linked.kind === 'border' && d.parentBoxId) {
    const pd = findBox(model, d.parentBoxId)?.diagram;
    const pa = pd && pd.kind === 'idef0' ? pd.arrows.find((x) => x.id === linked.parentArrowId) : undefined;
    if (pa && !definition) definition = pa.definition;
  }
  return [arrowEffectiveLabel(model, d, a), src, srcType, dst, dstType, definition, diagramNode(model, d.id)];
}

function nodeName(model: Model, diagramId: Id, id: Id): string {
  const d = model.diagrams[diagramId];
  if (!d || d.kind !== 'idef3') return '';
  const b = d.boxes.find((x) => x.id === id);
  if (b) return `${boxNumber(model, b.id)} ${b.name}`;
  const j = d.junctions.find((x) => x.id === id);
  if (j) return `Перехрестя J${j.num} (${j.type === 'and' ? '&' : j.type === 'xor' ? 'X' : 'O'})`;
  const r = d.referents.find((x) => x.id === id);
  if (r) return `Об'єкт-посилання «${r.name}»`;
  return '';
}

function linkRow(model: Model, diagramId: Id, linkId: Id): string[] {
  const d = model.diagrams[diagramId];
  if (d.kind !== 'idef3') return [];
  const l = d.links.find((x) => x.id === linkId)!;
  const t = LINK_UA[l.kind];
  return [l.label, nodeName(model, diagramId, l.from), t, nodeName(model, diagramId, l.to), t, l.definition, diagramNode(model, diagramId)];
}

function abcReport(model: Model, boxId?: Id): ReportSection {
  const entries = activitySubtree(model, boxId);
  const cc = model.costCenters;
  const cur = model.abc.currency;
  const columns = [
    'Номер',
    'Робота',
    ...cc.map((c) => `${c.name}, ${cur}`),
    `Разом, ${cur}`,
    `Тривалість, ${model.abc.timeUnit}`,
    'Частота',
  ];
  const rows = entries.map((e) => {
    const r = abcOf(model, e.box);
    return [
      boxNumber(model, e.box.id),
      `${'    '.repeat(e.depth)}${e.box.name}${r.computed ? ' *' : ''}`,
      ...cc.map((c) => formatNumber(r.costs[c.id] ?? 0)),
      formatNumber(r.total),
      formatNumber(r.duration, 3),
      formatNumber(r.frequency, 4),
    ];
  });
  const numeric = [...cc.map((_, i) => i + 2), cc.length + 2, cc.length + 3, cc.length + 4];
  return { caption: '* — значення обчислено автоматично з декомпозиції: сума (значення дочірньої роботи × її частота)', columns, rows, numeric };
}

/** Табл. 2.8 методички: центри витрат. */
function costCentersReport(model: Model): ReportSection {
  return {
    columns: ['Центр витрат', 'Визначення'],
    rows: model.costCenters.map((c) => [c.name, c.definition]),
  };
}

/**
 * Табл. 2.9 методички: по рядку на кожну пару «робота + центр витрат».
 * Тривалість і частота — параметри роботи, тому повторюються в кожному її рядку.
 */
function abcParamsReport(model: Model, boxId?: Id): ReportSection {
  const entries = activitySubtree(model, boxId);
  const rows: string[][] = [];
  for (const e of entries) {
    const r = abcOf(model, e.box);
    const name = `${boxNumber(model, e.box.id)} ${e.box.name}${r.computed ? ' *' : ''}`;
    const centers = model.costCenters.length ? model.costCenters : [null];
    for (const cc of centers) {
      rows.push([
        name,
        cc ? cc.name : '—',
        formatNumber(cc ? r.costs[cc.id] ?? 0 : 0),
        formatNumber(r.duration, 3),
        formatNumber(r.frequency, 4),
      ]);
    }
  }
  return {
    caption: `Вартість — у ${model.abc.currency}, тривалість — у ${model.abc.timeUnit}. * — значення обчислено автоматично з декомпозиції.`,
    columns: ["Ім'я роботи", 'Центр витрат', 'Вартість', 'Тривалість', 'Частота'],
    numeric: [2, 3, 4],
    rows,
  };
}

export { diagramLabel };
