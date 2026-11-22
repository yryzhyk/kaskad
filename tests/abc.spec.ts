import { expect, test } from '@playwright/test';
import { currentDiagram, decomposeSelected, fresh, selectBox } from './helpers';

test('ABC: центри витрат, параметри, обчислення через IDEF0 та IDEF3 з дробовою частотою', async ({ page }) => {
  await fresh(page);
  // налаштування ABC
  await page.getByTestId('btn-abc').click();
  await expect(page.getByTestId('abc-currency')).toHaveValue('грн');
  await expect(page.getByTestId('abc-timeunit')).toHaveValue('години');
  await page.getByTestId('cc-add').click();
  await page.getByTestId('cc-add').click();
  await page.getByTestId('cc-name-0').fill('Праця');
  await page.getByTestId('cc-def-0').fill('Оплата праці');
  await page.getByTestId('cc-name-1').fill('Матеріали');
  await page.getByTestId('modal-close').click();

  const root = await currentDiagram(page);
  const a0 = root.boxes[0];
  await selectBox(page, a0.id);
  await decomposeSelected(page, 'idef0', 3);
  const d = await currentDiagram(page);
  const [b1, b2, b3] = d.boxes;

  const setLeaf = async (id: string, labor: string, mat: string, dur: string, freq: string) => {
    await selectBox(page, id);
    await page.getByTestId('abc-cost-Праця').fill(labor);
    await page.getByTestId('abc-cost-Матеріали').fill(mat);
    await page.getByTestId('abc-duration-input').fill(dur);
    await page.getByTestId('abc-frequency').fill(freq);
  };
  await setLeaf(b1.id, '100', '50', '2', '1');
  await setLeaf(b3.id, '10', '10', '0,5', '2');

  // A2 → IDEF3 з двома UOB (гілки після X з частотами 0,3 і 0,7)
  await selectBox(page, b2.id);
  await page.getByTestId('abc-frequency').fill('1.5');
  await decomposeSelected(page, 'idef3', 2);
  const i3 = await currentDiagram(page);
  await setLeaf(i3.boxes[0].id, '200', '0', '1', '0,3');
  await setLeaf(i3.boxes[1].id, '100', '40', '2', '0.7');

  // A2: праця 200×0.3+100×0.7 = 130; матеріали 40×0.7 = 28; разом 158; тривалість 1×0.3+2×0.7 = 1.7
  const abc2 = await page.evaluate((id) => (window as any).kaskad.abc(id), b2.id);
  expect(abc2.total).toBeCloseTo(158, 6);
  expect(abc2.duration).toBeCloseTo(1.7, 6);
  expect(abc2.computed).toBe(true);
  // A0 = A1×1 + A2×1.5 + A3×2: праця 100+195+20 = 315; матеріали 50+42+20 = 112; разом 427; тривалість 2+2.55+1 = 5.55
  const abc0 = await page.evaluate((id) => (window as any).kaskad.abc(id), a0.id);
  const m = await page.evaluate(() => (window as any).kaskad.getModel());
  const [ccL, ccM] = m.costCenters.map((c: any) => c.id);
  expect(abc0.costs[ccL]).toBeCloseTo(315, 6);
  expect(abc0.costs[ccM]).toBeCloseTo(112, 6);
  expect(abc0.total).toBeCloseTo(427, 6);
  expect(abc0.duration).toBeCloseTo(5.55, 6);

  // у декомпозованої роботи значення не вводяться вручну
  await page.getByTestId('tree-A0').click();
  await selectBox(page, b2.id);
  await expect(page.getByTestId('abc-cost-Праця')).toHaveCount(0);
  await expect(page.getByTestId('abc-total')).toHaveText('158 грн');
  await expect(page.getByTestId('abc-duration')).toHaveText('1,7 години');
  await page.getByTestId('tree-A-0').click();
  await selectBox(page, a0.id);
  await expect(page.getByTestId('abc-total')).toHaveText('427 грн');

  // вартість на блоках (лівий нижній кут)
  await page.getByTestId('toggle-cost').check();
  await expect(page.locator('.diagram-svg [data-box-cost]')).toHaveText(['427 грн']);
  const costBox = await page.locator('.diagram-svg [data-box-cost]').boundingBox();
  const rect = await page.locator(`.diagram-svg [data-box="${a0.id}"] rect`).first().boundingBox();
  expect(costBox!.x).toBeLessThan(rect!.x + rect!.width / 2);
  expect(costBox!.y).toBeGreaterThan(rect!.y + rect!.height / 2);

  // звіт ABC для всієї моделі
  await page.getByTestId('btn-reports').click();
  await page.getByTestId('report-abc').click();
  const table = page.getByTestId('report-table-0');
  await expect(table.locator('th')).toHaveText(['Номер', 'Робота', 'Праця, грн', 'Матеріали, грн', 'Разом, грн', 'Тривалість, години', 'Частота']);
  const row = (n: string) => table.locator('tr', { has: page.locator(`td:first-child:text-is("${n}")`) });
  await expect(row('A0').locator('td')).toHaveText(['A0', /.*\*/, '315', '112', '427', '5,55', '1']);
  await expect(row('A2').locator('td')).toHaveText(['A2', /.*\*/, '130', '28', '158', '1,7', '1,5']);
  await expect(row('1').locator('td')).toHaveText(['1', /Дія 1/, '200', '0', '200', '1', '0,3']);
  await expect(row('2').locator('td')).toHaveText(['2', /Дія 2/, '100', '40', '140', '2', '0,7']);
  // звіт ABC для обраної роботи A2
  await page.getByTestId('report-scope').selectOption({ label: '  A2 Робота 2' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('report-scope-label')).toContainText('A2');
});
