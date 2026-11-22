import { expect, test } from '@playwright/test';
import {
  arrowMid,
  assertOrthogonal,
  boxRect,
  clickAt,
  currentDiagram,
  decomposeSelected,
  dragFromTo,
  fresh,
  layout,
  model,
  selectBox,
  svgTexts,
  ui,
} from './helpers';

test('створення моделі: властивості, контекстна діаграма A-0, заголовок Kaskad', async ({ page }) => {
  await fresh(page);
  await expect(page).toHaveTitle('Kaskad');
  await expect(page.locator('.brand-name')).toHaveText('Kaskad');
  await page.getByTestId('model-name').fill('Бібліотека');
  await page.getByTestId('model-author').fill('Іваненко І.І.');
  await page.getByTestId('model-purpose').fill('Описати обслуговування читачів');
  await page.getByTestId('model-viewpoint').fill('Завідувач бібліотеки');
  const m = await model(page);
  expect(m.name).toBe('Бібліотека');
  expect(m.author).toBe('Іваненко І.І.');
  expect(m.purpose).toBe('Описати обслуговування читачів');
  expect(m.viewpoint).toBe('Завідувач бібліотеки');
  // Контекстна діаграма з одним блоком A0
  const d = await currentDiagram(page);
  expect(d.boxes).toHaveLength(1);
  await expect(page.getByTestId('tool-box')).toBeDisabled();
  await expect(page.locator('[data-frame-node]')).toHaveText('A-0');
  await expect(page.locator('[data-box-number]')).toHaveText(['A0']);
  // Назва та визначення роботи; назва діаграми у рамці
  await selectBox(page, d.boxes[0].id);
  await page.getByTestId('prop-name').fill('Обслуговувати читачів бібліотеки та вести облік книжкового фонду');
  await page.getByTestId('prop-definition').fill('Основна діяльність бібліотеки');
  await expect(page.locator('[data-frame-title]')).toHaveText('Обслуговувати читачів бібліотеки та вести облік книжкового фонду');
  // довга назва переноситься на кілька рядків усередині блоку
  const lines = await page.locator(`[data-box="${d.boxes[0].id}"] text`).first().locator('tspan').count();
  expect(lines).toBeGreaterThan(1);
  const textBox = await page.locator(`[data-box="${d.boxes[0].id}"] text`).first().boundingBox();
  const rectBox = await page.locator(`[data-box="${d.boxes[0].id}"] rect`).first().boundingBox();
  expect(textBox!.x).toBeGreaterThanOrEqual(rectBox!.x);
  expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(rectBox!.x + rectBox!.width);
  const m2 = await model(page);
  expect(m2.diagrams[m2.rootDiagramId].boxes[0].definition).toBe('Основна діяльність бібліотеки');
  // автозбереження чернетки
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.locator('[data-frame-title]')).toHaveText('Обслуговувати читачів бібліотеки та вести облік книжкового фонду');
});

test('декомпозиція: сходинки, нумерація A1.., A11.., попередження 3–6, undo/redo', async ({ page }) => {
  await fresh(page);
  const root = await currentDiagram(page);
  await selectBox(page, root.boxes[0].id);
  await decomposeSelected(page, 'idef0', 3);
  let d = await currentDiagram(page);
  expect(d.kind).toBe('idef0');
  expect(d.boxes).toHaveLength(3);
  await expect(page.locator('[data-frame-node]')).toHaveText('A0');
  await expect(page.locator('[data-box-number]')).toHaveText(['A1', 'A2', 'A3']);
  // сходинки: зліва зверху — вправо вниз
  for (let i = 1; i < 3; i++) {
    expect(d.boxes[i].x).toBeGreaterThan(d.boxes[i - 1].x + d.boxes[i - 1].w - 1);
    expect(d.boxes[i].y).toBeGreaterThan(d.boxes[i - 1].y + d.boxes[i - 1].h - 1);
  }
  await expect(page.getByTestId('diagram-warning')).toHaveCount(0);

  // декомпозиція A1 подвійним кліком
  const r = await boxRect(page, d.boxes[0].id);
  await clickAt(page, { x: r.x + r.w / 2, y: r.y + r.h / 2 }, { dbl: true });
  await expect(page.getByTestId('decompose-dialog')).toBeVisible();
  await page.getByTestId('decomp-count').fill('7');
  await expect(page.getByTestId('decomp-warning')).toBeVisible();
  await page.getByTestId('decomp-count').fill('4');
  await expect(page.getByTestId('decomp-warning')).toHaveCount(0);
  await page.getByTestId('decomp-ok').click();
  await expect(page.locator('[data-frame-node]')).toHaveText('A1');
  await expect(page.locator('[data-box-number]')).toHaveText(['A11', 'A12', 'A13', 'A14']);

  // видаляємо 2 блоки → попередження «від 3 до 6»
  d = await currentDiagram(page);
  await selectBox(page, d.boxes[3].id);
  await page.keyboard.press('Delete');
  await selectBox(page, d.boxes[2].id);
  await page.keyboard.press('Delete');
  expect((await currentDiagram(page)).boxes).toHaveLength(2);
  await expect(page.getByTestId('diagram-warning')).toContainText('від 3 до 6');
  // Ctrl+Z / Ctrl+Y
  await page.keyboard.press('Control+z');
  expect((await currentDiagram(page)).boxes).toHaveLength(3);
  await expect(page.getByTestId('diagram-warning')).toHaveCount(0);
  await page.keyboard.press('Control+y');
  expect((await currentDiagram(page)).boxes).toHaveLength(2);
  await page.keyboard.press('Control+z');

  // новий блок інструментом «Блок» → A14, ще один → 5 блоків
  await page.getByTestId('tool-box').click();
  await clickAt(page, { x: 900, y: 650 });
  await expect(page.locator('[data-box-number]')).toHaveText(['A11', 'A12', 'A13', 'A14']);

  // переміщення та зміна розміру
  d = await currentDiagram(page);
  const b = d.boxes[3];
  await dragFromTo(page, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, { x: b.x + b.w / 2 - 100, y: b.y + b.h / 2 - 40 });
  let b2 = (await currentDiagram(page)).boxes[3];
  expect(Math.abs(b2.x - (b.x - 100))).toBeLessThanOrEqual(5);
  expect(Math.abs(b2.y - (b.y - 40))).toBeLessThanOrEqual(5);
  await dragFromTo(page, { x: b2.x + b2.w, y: b2.y + b2.h }, { x: b2.x + b2.w + 60, y: b2.y + b2.h + 30 });
  const b3 = (await currentDiagram(page)).boxes[3];
  expect(b3.w).toBeGreaterThanOrEqual(b2.w + 55);
  expect(b3.h).toBeGreaterThanOrEqual(b2.h + 25);
  // одна дія перетягування = один крок історії
  await page.keyboard.press('Control+z');
  b2 = (await currentDiagram(page)).boxes[3];
  expect(b2.w).toBe(b.w);

  // дерево моделі та дерево вузлів
  await page.getByTestId('tree-node-tree').click();
  await expect(page.locator('.diagram-svg [data-tree-node]')).toHaveCount(1 + 3 + 4);
  const texts = await svgTexts(page);
  for (const n of ['A0', 'A1', 'A2', 'A3', 'A11', 'A14']) expect(texts).toContain(n);
});

test('стрілки: 4 типи, ортогональність, підписи, перетягування підпису, граничні стрілки ICOM', async ({ page }) => {
  await fresh(page);
  const root = await currentDiagram(page);
  const a0 = root.boxes[0];
  const r = await boxRect(page, a0.id);
  await page.getByTestId('tool-arrow').click();
  // вхід: порожнє місце ліворуч → середина блоку
  await clickAt(page, { x: 100, y: r.y + r.h / 2 });
  await clickAt(page, { x: r.x + 20, y: r.y + r.h / 2 });
  // управління: порожнє місце згори → верхня частина блоку
  await clickAt(page, { x: r.x + r.w / 2, y: 100 });
  await clickAt(page, { x: r.x + r.w / 2, y: r.y + 10 });
  // механізм: знизу → нижня частина блоку
  await clickAt(page, { x: r.x + r.w / 2, y: 700 });
  await clickAt(page, { x: r.x + r.w / 2, y: r.y + r.h - 10 });
  // вихід: блок → порожнє місце праворуч (перетягуванням)
  await dragFromTo(page, { x: r.x + r.w - 20, y: r.y + r.h / 2 }, { x: 1050, y: r.y + r.h / 2 });

  let d = await currentDiagram(page);
  expect(d.arrows).toHaveLength(4);
  const kinds = d.arrows.map((a: any) => `${a.source.kind}:${a.source.side ?? a.source.role}->${a.target.kind}:${a.target.side ?? a.target.role}`);
  expect(kinds).toEqual(['border:left->box:input', 'border:top->box:control', 'border:bottom->box:mechanism', 'box:output->border:right']);
  const l = await layout(page);
  for (const a of l.arrows) assertOrthogonal(a.points);

  // назви та визначення стрілок
  const names = ['Запит читача', 'Правила користування', 'Бібліотекар', 'Видана книга'];
  await page.getByTestId('tool-select').click();
  for (let i = 0; i < 4; i++) {
    await clickAt(page, await arrowMid(page, d.arrows[i].id));
    await expect(page.getByTestId('prop-arrow-label')).toBeVisible();
    await page.getByTestId('prop-arrow-label').fill(names[i]);
    await page.getByTestId('prop-arrow-definition').fill(`Визначення: ${names[i]}`);
  }
  const texts = await svgTexts(page);
  for (const n of ['Запит', 'Бібліотекар']) expect(texts.join(' ')).toContain(n);

  // перетягування підпису
  let lay = await layout(page);
  const lab = lay.arrows[0].label;
  await dragFromTo(page, { x: lab.cx, y: lab.cy }, { x: lab.cx + 30, y: lab.cy - 60 });
  lay = await layout(page);
  expect(Math.abs(lay.arrows[0].label.cx - (lab.cx + 30))).toBeLessThan(3);
  expect(Math.abs(lay.arrows[0].label.cy - (lab.cy - 60))).toBeLessThan(3);
  d = await currentDiagram(page);
  expect(d.arrows[0].labelOffset).toBeTruthy();

  // декомпозиція → граничні стрілки з кодами ICOM
  await selectBox(page, a0.id);
  await decomposeSelected(page, 'idef0', 3);
  const child = await currentDiagram(page);
  expect(child.arrows).toHaveLength(4);
  const childTexts = await svgTexts(page);
  for (const c of ['I1', 'C1', 'O1', 'M1']) expect(childTexts).toContain(c);
  for (const n of names) expect(childTexts.join(' ')).toContain(n.split(' ')[0]);
  await expect(page.getByTestId('diagram-warning')).toContainText("Непід'єднані");

  // під'єднуємо I1 до A1, C1 до A2, M1 до A3, O1 від A3
  const stub = (side: string) => child.arrows.find((a: any) => a.source.side === side || a.target.side === side);
  const [b1, b2, b3] = child.boxes;
  await page.getByTestId('tool-arrow').click();
  const r1 = await boxRect(page, b1.id);
  await clickAt(page, await arrowMid(page, stub('left').id));
  await clickAt(page, { x: r1.x + 10, y: r1.y + r1.h / 2 });
  const r2 = await boxRect(page, b2.id);
  await clickAt(page, await arrowMid(page, stub('top').id));
  await clickAt(page, { x: r2.x + r2.w / 2, y: r2.y + 8 });
  const r3 = await boxRect(page, b3.id);
  await clickAt(page, await arrowMid(page, stub('bottom').id));
  await clickAt(page, { x: r3.x + r3.w / 2, y: r3.y + r3.h - 8 });
  await clickAt(page, { x: r3.x + r3.w - 10, y: r3.y + r3.h / 2 });
  await clickAt(page, await arrowMid(page, stub('right').id));

  const c2 = await currentDiagram(page);
  expect(c2.arrows).toHaveLength(4);
  for (const a of c2.arrows) {
    expect(a.source.kind).not.toBe('point');
    expect(a.target.kind).not.toBe('point');
  }
  expect(c2.arrows.find((a: any) => a.source.side === 'left').target).toMatchObject({ kind: 'box', boxId: b1.id, role: 'input' });
  expect(c2.arrows.find((a: any) => a.source.side === 'top').target).toMatchObject({ kind: 'box', boxId: b2.id, role: 'control' });
  expect(c2.arrows.find((a: any) => a.source.side === 'bottom').target).toMatchObject({ kind: 'box', boxId: b3.id, role: 'mechanism' });
  expect(c2.arrows.find((a: any) => a.target.side === 'right').source).toMatchObject({ kind: 'box', boxId: b3.id, role: 'output' });
  await expect(page.getByTestId('diagram-warning')).toHaveCount(0);
  for (const a of (await layout(page)).arrows) assertOrthogonal(a.points);

  // нова стрілка на батьківській діаграмі автоматично з'являється на дочірній як I2
  await page.getByTestId('tree-A-0').click();
  await selectBox(page, a0.id);
  await page.getByTestId('add-input').click();
  await selectBox(page, a0.id);
  await page.getByTestId('open-child').click();
  expect((await currentDiagram(page)).arrows).toHaveLength(5);
  expect(await svgTexts(page)).toContain('I2');
  // видалення на батьківській діаграмі прибирає граничну стрілку
  await page.getByTestId('tree-A-0').click();
  await page.keyboard.press('Control+z');
  await page.getByTestId('tree-A0').click();
  expect((await currentDiagram(page)).arrows).toHaveLength(4);
});

test('розгалуження і злиття стрілок', async ({ page }) => {
  await fresh(page);
  const root = await currentDiagram(page);
  await selectBox(page, root.boxes[0].id);
  await decomposeSelected(page, 'idef0', 3);
  const d = await currentDiagram(page);
  const [b1, b2, b3] = d.boxes;
  const r1 = await boxRect(page, b1.id);
  const r2 = await boxRect(page, b2.id);
  const r3 = await boxRect(page, b3.id);
  await page.getByTestId('tool-arrow').click();
  // A1 → A2 (вхід)
  await clickAt(page, { x: r1.x + r1.w / 2, y: r1.y + r1.h / 2 });
  await clickAt(page, { x: r2.x + 10, y: r2.y + r2.h / 2 });
  let m = await currentDiagram(page);
  const main = m.arrows[0];
  // розгалуження: зі стрілки A1→A2 до управління A3
  const mid = await arrowMid(page, main.id);
  await clickAt(page, mid);
  await clickAt(page, { x: r3.x + r3.w / 2, y: r3.y + 8 });
  m = await currentDiagram(page);
  const fork = m.arrows[1];
  expect(fork.source.kind).toBe('arrow');
  expect(fork.source.arrowId).toBe(main.id);
  expect(fork.target).toMatchObject({ kind: 'box', boxId: b3.id, role: 'control' });
  // вихід A2 → межа праворуч
  await clickAt(page, { x: r2.x + r2.w - 10, y: r2.y + r2.h / 2 });
  await clickAt(page, { x: 1080, y: r2.y + r2.h / 2 });
  m = await currentDiagram(page);
  const out = m.arrows[2];
  expect(out.target).toMatchObject({ kind: 'border', side: 'right' });
  // злиття: вихід A3 зливається зі стрілкою A2→межа
  await clickAt(page, { x: r3.x + r3.w - 10, y: r3.y + r3.h / 2 });
  await clickAt(page, await arrowMid(page, out.id));
  m = await currentDiagram(page);
  const join = m.arrows[3];
  expect(join.source).toMatchObject({ kind: 'box', boxId: b3.id, role: 'output' });
  expect(join.target.kind).toBe('arrow');
  expect(join.target.arrowId).toBe(out.id);

  const lay = await layout(page);
  for (const a of lay.arrows) assertOrthogonal(a.points);
  // початок гілки лежить на шляху основної стрілки; кінець злиття — на шляху вихідної
  const onPath = (p: any, pts: any[]) =>
    pts.some((a: any, i: number) => {
      const b = pts[i + 1];
      if (!b) return false;
      const minX = Math.min(a.x, b.x) - 0.5;
      const maxX = Math.max(a.x, b.x) + 0.5;
      const minY = Math.min(a.y, b.y) - 0.5;
      const maxY = Math.max(a.y, b.y) + 0.5;
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    });
  const pathOf = (id: string) => lay.arrows.find((a: any) => a.id === id).points;
  expect(onPath(pathOf(fork.id)[0], pathOf(main.id))).toBe(true);
  const jp = pathOf(join.id);
  expect(onPath(jp[jp.length - 1], pathOf(out.id))).toBe(true);
  // у гілки без власної назви — назва батьківської стрілки (у звіті)
  await page.getByTestId('tool-select').click();
  await clickAt(page, await arrowMid(page, main.id));
  await page.getByTestId('prop-arrow-label').fill('Дані');
  const rep = await page.evaluate(() => (window as any).kaskad.report('arrows'));
  const forkRow = rep.sections[0].rows.find((r: string[]) => r[1].startsWith('Розгалуження'));
  expect(forkRow[0]).toBe('Дані');
  expect(forkRow[2]).toBe('Розгалуження');
  // видалення стрілки
  await page.getByTestId('delete-selection').click();
  m = await currentDiagram(page);
  expect(m.arrows.find((a: any) => a.id === main.id)).toBeUndefined();
  expect((await ui(page)).selection).toBeNull();
});

test('редагування назви — один крок історії; Delete працює після кліку на полотні', async ({ page }) => {
  await fresh(page);
  const root = await currentDiagram(page);
  await selectBox(page, root.boxes[0].id);
  await decomposeSelected(page, 'idef0', 3);
  const d = await currentDiagram(page);
  await selectBox(page, d.boxes[0].id);
  await page.getByTestId('prop-name').fill('Перша');
  await page.getByTestId('prop-name').pressSequentially(' робота');
  // клік по іншому блоку знімає фокус з поля
  await selectBox(page, d.boxes[1].id);
  await page.keyboard.press('Control+z');
  expect((await currentDiagram(page)).boxes[0].name).toBe('Робота 1');
  await page.keyboard.press('Control+y');
  expect((await currentDiagram(page)).boxes[0].name).toBe('Перша робота');
  await selectBox(page, d.boxes[2].id);
  await page.getByTestId('prop-name').fill('Третя');
  await selectBox(page, d.boxes[2].id);
  await page.keyboard.press('Delete');
  expect((await currentDiagram(page)).boxes).toHaveLength(2);
  await page.keyboard.press('Control+z');
  expect((await currentDiagram(page)).boxes.map((b: any) => b.name)).toEqual(['Перша робота', 'Робота 2', 'Третя']);
});

test('довга назва блоку: шрифт зменшується, без «…»; якщо не вміщається — попередження', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('.diagram-svg [data-frame]')).toContainText('ПРОЄКТ:');
  const root = await currentDiagram(page);
  await selectBox(page, root.boxes[0].id);
  await decomposeSelected(page, 'idef0', 3);
  const d = await currentDiagram(page);
  const id = d.boxes[0].id;
  await selectBox(page, id);
  const boxLayout = async () => (await layout(page)).boxes.find((b: any) => b.id === id);

  // коротка назва — 13 px
  await page.getByTestId('prop-name').fill('Прийняти замовлення');
  expect((await boxLayout()).fontSize).toBe(13);
  await expect(page.getByTestId('name-font-note')).toHaveCount(0);

  // довга назва — шрифт менший, увесь текст на місці, без «…»
  const long = 'Прийняти, зареєструвати та перевірити замовлення клієнта на виготовлення меблів за індивідуальними розмірами';
  await page.getByTestId('prop-name').fill(long);
  let b = await boxLayout();
  expect(b.fontSize).toBeLessThan(13);
  expect(b.fontSize).toBeGreaterThanOrEqual(9);
  expect(b.overflow).toBe(false);
  expect(b.lines.join(' ')).toBe(long);
  await expect(page.getByTestId('name-font-note')).toBeVisible();
  const texts = await page.locator(`.diagram-svg [data-box="${id}"] text`).first().textContent();
  expect(texts).not.toContain('…');
  await expect(page.locator(`[data-overflow-warning="${id}"]`)).toHaveCount(0);
  // текст не виходить за межі блоку
  const fits = await page.evaluate((bid) => {
    const g = document.querySelector(`.diagram-svg [data-box="${bid}"]`)!;
    const r = (g.querySelector('rect') as SVGGraphicsElement).getBBox();
    const t = (g.querySelector('text') as SVGGraphicsElement).getBBox();
    return t.x >= r.x && t.x + t.width <= r.x + r.width && t.y >= r.y && t.y + t.height <= r.y + r.height;
  }, id);
  expect(fits).toBe(true);

  // надто довга назва — явне попередження на блоці, у властивостях і на панелі інструментів
  const huge = Array.from({ length: 8 }, () => long).join(' ');
  await page.getByTestId('prop-name').fill(huge);
  b = await boxLayout();
  expect(b.fontSize).toBe(9);
  expect(b.overflow).toBe(true);
  expect(b.lines.join(' ')).toBe(huge);
  await expect(page.locator(`[data-overflow-warning="${id}"]`)).toBeVisible();
  await expect(page.getByTestId('name-overflow-warning')).toBeVisible();
  await expect(page.getByTestId('diagram-warning')).toContainText('не вміщається');
  // попередження не потрапляє в експорт
  const svg: string = await page.evaluate(() => (window as any).kaskad.svg());
  expect(svg).not.toContain('Назва не вміщається');
  expect(svg).not.toContain('…');

  // збільшуємо блок — попередження зникає
  await page.evaluate(
    ([did, bid]) =>
      (window as any).kaskad.commit((m: any) => {
        const bx = m.diagrams[did].boxes.find((x: any) => x.id === bid);
        bx.x = 60;
        bx.y = 60;
        bx.w = 600;
        bx.h = 420;
      }),
    [d.id, id],
  );
  await expect(page.locator(`[data-overflow-warning="${id}"]`)).toHaveCount(0);
  await expect(page.getByTestId('name-overflow-warning')).toHaveCount(0);
});
