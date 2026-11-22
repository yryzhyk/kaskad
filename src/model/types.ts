export type Id = string;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Сторона рамки або блоку. */
export type Side = 'left' | 'top' | 'right' | 'bottom';

/** Роль стрілки IDEF0 відносно блоку (ICOM). */
export type Role = 'input' | 'control' | 'output' | 'mechanism';

/** Параметри функціонально-вартісного аналізу роботи. */
export interface AbcData {
  /** Вартість по кожному центру витрат (id центру → сума). */
  costs: Record<Id, number>;
  duration: number;
  frequency: number;
}

/** Блок IDEF0 або одиниця роботи (UOB) IDEF3. */
export interface Box {
  id: Id;
  name: string;
  definition: string;
  x: number;
  y: number;
  w: number;
  h: number;
  abc: AbcData;
  /** Дочірня діаграма (декомпозиція) — IDEF0 або IDEF3. */
  childDiagramId?: Id;
  /** Номер UOB (лише IDEF3). */
  num?: number;
  /** Посилання (права клітинка нижньої смуги UOB, лише IDEF3). */
  ref?: string;
}

export type Endpoint =
  | { kind: 'box'; boxId: Id; role: Role }
  | {
      kind: 'border';
      side: Side;
      /** Положення вздовж рамки (якщо задане вручну). */
      offset?: number;
      /** Для граничних стрілок дочірньої діаграми: стрілка батьківської діаграми. */
      parentArrowId?: Id;
      parentEnd?: 'source' | 'target';
    }
  | { kind: 'arrow'; arrowId: Id; x: number; y: number }
  | { kind: 'point'; x: number; y: number };

export interface Bend {
  axis: 'x' | 'y';
  value: number;
}

export interface Arrow {
  id: Id;
  label: string;
  definition: string;
  source: Endpoint;
  target: Endpoint;
  /** Зсув підпису від базової точки (середина найдовшого відрізка). */
  labelOffset?: Point;
  /** Ручне положення середнього відрізка. */
  bend?: Bend;
}

export interface Idef0Diagram {
  id: Id;
  kind: 'idef0';
  /** Блок батьківської діаграми, декомпозицією якого є ця діаграма (null для A-0). */
  parentBoxId: Id | null;
  boxes: Box[];
  arrows: Arrow[];
}

export type JunctionType = 'and' | 'xor' | 'or';

export interface Junction {
  id: Id;
  type: JunctionType;
  sync: boolean;
  num: number;
  x: number;
  y: number;
  definition: string;
}

export interface Referent {
  id: Id;
  name: string;
  definition: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LinkKind = 'precedence' | 'relational' | 'objectFlow';

export interface Link {
  id: Id;
  kind: LinkKind;
  label: string;
  definition: string;
  from: Id;
  to: Id;
  labelOffset?: Point;
  bend?: Bend;
}

export interface Idef3Diagram {
  id: Id;
  kind: 'idef3';
  parentBoxId: Id;
  boxes: Box[];
  junctions: Junction[];
  referents: Referent[];
  links: Link[];
}

export type Diagram = Idef0Diagram | Idef3Diagram;

export interface CostCenter {
  id: Id;
  name: string;
  definition: string;
}

export interface AbcSettings {
  currency: string;
  timeUnit: string;
  showCost: boolean;
}

export interface Model {
  format: 'kaskad';
  version: 1;
  name: string;
  author: string;
  purpose: string;
  viewpoint: string;
  definition: string;
  createdAt: string;
  abc: AbcSettings;
  costCenters: CostCenter[];
  diagrams: Record<Id, Diagram>;
  rootDiagramId: Id;
  counters: { uob: number; junction: number };
}

/** Спеціальний ідентифікатор для обчислюваної діаграми «Дерево вузлів». */
export const NODE_TREE_ID = '__node_tree__';
