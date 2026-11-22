import { expect, type Page } from '@playwright/test';

export const PAGE_W = 1120;
export const PAGE_H = 792;

export interface Pt {
  x: number;
  y: number;
}

/** Відкрити застосунок з чистою моделлю. */
export async function fresh(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.evaluate(() => (window as any).kaskad.reset());
  await page.getByRole('button', { name: 'Вмістити' }).click();
}

/** Перетворення координат діаграми в координати екрана. */
export async function toScreen(page: Page, p: Pt): Promise<Pt> {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + (p.x * box.width) / PAGE_W, y: box.y + (p.y * box.height) / PAGE_H };
}

export async function clickAt(page: Page, p: Pt, opts: { dbl?: boolean } = {}) {
  const s = await toScreen(page, p);
  if (opts.dbl) await page.mouse.dblclick(s.x, s.y);
  else await page.mouse.click(s.x, s.y);
}

export async function dragFromTo(page: Page, a: Pt, b: Pt) {
  const s = await toScreen(page, a);
  const e = await toScreen(page, b);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move((s.x + e.x) / 2, (s.y + e.y) / 2, { steps: 4 });
  await page.mouse.move(e.x, e.y, { steps: 4 });
  await page.mouse.up();
}

export const model = (page: Page) => page.evaluate(() => (window as any).kaskad.getModel());
export const ui = (page: Page) => page.evaluate(() => (window as any).kaskad.getUi());
export const layout = (page: Page, id?: string) => page.evaluate((i) => (window as any).kaskad.getLayout(i), id);

export async function currentDiagram(page: Page) {
  const m = await model(page);
  const u = await ui(page);
  return m.diagrams[u.diagramId];
}

export async function boxRect(page: Page, boxId: string) {
  const l = await layout(page);
  return l.boxes.find((b: any) => b.id === boxId).rect as { x: number; y: number; w: number; h: number };
}

export const center = (r: { x: number; y: number; w: number; h: number }): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export async function selectBox(page: Page, boxId: string) {
  await page.getByTestId('tool-select').click();
  const r = await boxRect(page, boxId);
  await clickAt(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
}

/** Точка посередині найдовшого відрізка стрілки. */
export async function arrowMid(page: Page, arrowId: string): Promise<Pt> {
  const l = await layout(page);
  const a = l.arrows.find((x: any) => x.id === arrowId);
  let best = 0;
  let len = -1;
  for (let i = 0; i < a.points.length - 1; i++) {
    const d = Math.abs(a.points[i].x - a.points[i + 1].x) + Math.abs(a.points[i].y - a.points[i + 1].y);
    if (d > len) {
      len = d;
      best = i;
    }
  }
  return { x: (a.points[best].x + a.points[best + 1].x) / 2, y: (a.points[best].y + a.points[best + 1].y) / 2 };
}

export async function decomposeSelected(page: Page, kind: 'idef0' | 'idef3', count: number) {
  await page.getByTestId('decompose').click();
  await expect(page.getByTestId('decompose-dialog')).toBeVisible();
  await page.getByTestId(kind === 'idef0' ? 'decomp-idef0' : 'decomp-idef3').check();
  await page.getByTestId('decomp-count').fill(String(count));
  await page.getByTestId('decomp-ok').click();
  await expect(page.getByTestId('decompose-dialog')).toBeHidden();
}

export function assertOrthogonal(points: Pt[]) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, `відрізок ${i} не ортогональний: ${JSON.stringify([a, b])}`).toBe(true);
  }
}

export async function svgTexts(page: Page, selector = '.diagram-svg text'): Promise<string[]> {
  return page.locator(selector).allTextContents();
}
