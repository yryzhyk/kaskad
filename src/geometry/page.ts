/** Розміри сторінки діаграми (альбомна орієнтація, пропорції A4). */
export const PAGE_W = 1120;
export const PAGE_H = 792;
export const FRAME_MARGIN = 8;
export const HEADER_H = 34;
export const FOOTER_H = 46;

/** Робоча область діаграми (всередині рамки). Граничні стрілки торкаються її країв. */
export const AREA = {
  left: FRAME_MARGIN,
  right: PAGE_W - FRAME_MARGIN,
  top: FRAME_MARGIN + HEADER_H,
  bottom: PAGE_H - FRAME_MARGIN - FOOTER_H,
};

export const BOX_W = 150;
export const BOX_H = 80;
export const UOB_W = 140;
export const UOB_H = 72;
export const UOB_STRIP = 18;
export const JUNCTION_W = 26;
export const JUNCTION_H = 64;
export const REFERENT_W = 120;
export const REFERENT_H = 40;
export const MIN_BOX_W = 70;
export const MIN_BOX_H = 40;
export const GRID = 5;

export const DIAGRAM_FONT = 'KaskadArimo';
export const BOX_FONT_SIZE = 13;
/** Мінімальний розмір шрифту назви блоку при автоматичному зменшенні. */
export const MIN_BOX_FONT_SIZE = 9;
export const LABEL_FONT_SIZE = 12;
export const SMALL_FONT_SIZE = 11;

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}
