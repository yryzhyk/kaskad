import { expect, test, type Page } from '@playwright/test';
import { fresh, selectBox } from './helpers';

const DIR = 'docs/screenshots';

interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: R, b: R, pad = 0) => a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

async function checkDiagramLayout(page: Page, diagramId: string) {
  const l = await page.evaluate((id) => (window as any).kaskad.getLayout(id), diagramId);
  const nodes: R[] = [...l.boxes.map((b: any) => b.rect), ...l.junctions.map((j: any) => j.rect), ...l.referents.map((r: any) => r.rect)];
  const labels: R[] = l.arrows.filter((a: any) => a.label).map((a: any) => ({ x: a.label.cx - a.label.w / 2, y: a.label.cy - a.label.h / 2, w: a.label.w, h: a.label.h }));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i], nodes[j]), `блоки ${i} і ${j} накладаються`).toBe(false);
  for (const lb of labels) {
    for (const n of nodes) expect(overlap(lb, n), `підпис накладається на блок: ${JSON.stringify(lb)}`).toBe(false);
    expect(lb.x >= 8 && lb.y >= 42 && lb.x + lb.w <= 1112 && lb.y + lb.h <= 738, 'підпис поза робочою областю').toBe(true);
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) expect(overlap(labels[i], labels[j]), `підписи ${i} і ${j} накладаються`).toBe(false);
  // текст усередині блоків не виходить за їхні межі
  const fits = await page.evaluate(() =>
    [...document.querySelectorAll('.diagram-svg [data-box]')].map((g) => {
      const r = (g.querySelector('rect') as SVGGraphicsElement).getBBox();
      return [...g.querySelectorAll('text')].every((t) => {
        const b = (t as SVGGraphicsElement).getBBox();
        return b.x >= r.x - 0.5 && b.x + b.width <= r.x + r.width + 0.5 && b.y >= r.y - 0.5 && b.y + b.height <= r.y + r.height + 0.5;
      });
    }),
  );
  expect(fits.every(Boolean), 'текст виходить за межі блоку').toBe(true);
}

async function checkUiPanels(page: Page) {
  const ids = ['model-tree', 'toolbar', 'canvas-scroll', 'properties'];
  const boxes = await Promise.all(ids.map(async (id) => (await page.getByTestId(id).boundingBox())!));
  const rs = boxes.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i], rs[j], 1), `${ids[i]} накладається на ${ids[j]}`).toBe(false);
  // кнопки панелі інструментів не обрізані
  const clipped = await page.evaluate(() => {
    const tb = document.querySelector('[data-testid="toolbar"]')!.getBoundingClientRect();
    return [...document.querySelectorAll('[data-testid="toolbar"] button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.right > tb.right + 1 || r.bottom > tb.bottom + 1;
    }).length;
  });
  expect(clipped).toBe(0);
  // верхнє меню вміщується без прокрутки
  const menu = await page.evaluate(() => {
    const m = document.querySelector('.menu') as HTMLElement;
    const top = document.querySelector('.topbar')!.getBoundingClientRect();
    const brand = document.querySelector('.brand')!.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    return { overflow: m.scrollWidth - m.clientWidth, right: mr.right - top.right, gap: mr.left - brand.right };
  });
  expect(menu.overflow).toBeLessThanOrEqual(0);
  expect(menu.right).toBeLessThanOrEqual(0);
  expect(menu.gap).toBeGreaterThanOrEqual(0);
}

test('скріншоти основних екранів і перевірка відсутності накладань', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('btn-sample').click();
  await page.getByRole('button', { name: 'Вмістити' }).click();
  const m = await page.evaluate(() => (window as any).kaskad.getModel());
  const order: string[] = [];
  const visit = (id: string) => {
    order.push(id);
    for (const b of m.diagrams[id].boxes) if (b.childDiagramId) visit(b.childDiagramId);
  };
  visit(m.rootDiagramId);

  await checkUiPanels(page);
  await checkDiagramLayout(page, order[0]);
  await page.screenshot({ path: `${DIR}/01-context-A-0.png` });

  await page.getByTestId('tree-A0').click();
  await checkDiagramLayout(page, order[1]);
  const a0 = m.diagrams[order[1]];
  await selectBox(page, a0.boxes[0].id);
  await checkUiPanels(page);
  await page.screenshot({ path: `${DIR}/02-decomposition-A0.png` });

  await page.getByTestId('tree-A2').click();
  await checkDiagramLayout(page, order[2]);
  await selectBox(page, m.diagrams[order[2]].boxes[2].id);
  await page.screenshot({ path: `${DIR}/03-idef3-A2.png` });

  await page.getByTestId('tree-node-tree').click();
  await page.screenshot({ path: `${DIR}/04-node-tree.png` });

  await page.getByTestId('tree-A0').click();
  await page.getByTestId('toggle-cost').check();
  await selectBox(page, a0.boxes[1].id);
  await checkDiagramLayout(page, order[1]);
  await page.screenshot({ path: `${DIR}/05-abc-costs.png` });
  await page.getByTestId('toggle-cost').uncheck();

  await page.getByTestId('btn-reports').click();
  await page.getByTestId('report-arrows').click();
  await page.screenshot({ path: `${DIR}/06-report-arrows.png` });
  await page.getByTestId('report-abc').click();
  await page.screenshot({ path: `${DIR}/07-report-abc.png` });
  await page.getByTestId('modal-close').click();

  await page.getByTestId('btn-abc').click();
  await page.screenshot({ path: `${DIR}/08-abc-settings.png` });
  await page.getByTestId('modal-close').click();

  await selectBox(page, a0.boxes[0].id);
  await page.getByTestId('decompose').click();
  await page.getByTestId('decomp-count').fill('7');
  await page.screenshot({ path: `${DIR}/09-decompose-dialog.png` });
  await page.getByTestId('modal-close').click();

  // вузьке вікно ноутбука
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.getByRole('button', { name: 'Вмістити' }).click();
  await checkUiPanels(page);
  await page.screenshot({ path: `${DIR}/10-laptop-1280.png` });
});
