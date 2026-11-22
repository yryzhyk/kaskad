import { expect, test } from '@playwright/test';
import { arrowMid, assertOrthogonal, boxRect, clickAt, currentDiagram, decomposeSelected, fresh, layout, selectBox, svgTexts } from './helpers';

test('IDEF3: UOB, перехрестя &/X/O (синхронні й асинхронні), зв\'язки, об\'єкти-посилання', async ({ page }) => {
  await fresh(page);
  const root = await currentDiagram(page);
  await selectBox(page, root.boxes[0].id);
  await decomposeSelected(page, 'idef3', 3);
  let d = await currentDiagram(page);
  expect(d.kind).toBe('idef3');
  expect(d.boxes).toHaveLength(3);
  await expect(page.locator('[data-box-number]')).toHaveText(['1', '2', '3']);
  await expect(page.locator('[data-frame-node]')).toHaveText('A0');

  // розставляємо UOB: 1 ліворуч, 2 вгорі, 3 внизу
  const [u1, u2, u3] = d.boxes;
  await page.evaluate(
    ([a, b, c, id]) =>
      (window as any).kaskad.commit((m: any) => {
        const dd = m.diagrams[id];
        const set = (bid: string, x: number, y: number) => {
          const bx = dd.boxes.find((q: any) => q.id === bid);
          bx.x = x;
          bx.y = y;
        };
        set(a, 80, 350);
        set(b, 480, 220);
        set(c, 480, 480);
      }),
    [u1.id, u2.id, u3.id, d.id],
  );

  // перехрестя: X (розгалуження) і синхронне & (злиття)
  await page.getByTestId('tool-junction:xor:async').click();
  await clickAt(page, { x: 330, y: 380 });
  await page.getByTestId('tool-junction:and:sync').click();
  await clickAt(page, { x: 760, y: 380 });
  d = await currentDiagram(page);
  expect(d.junctions).toHaveLength(2);
  const [j1, j2] = d.junctions;
  expect(j1).toMatchObject({ type: 'xor', sync: false });
  expect(j2).toMatchObject({ type: 'and', sync: true });

  // ще одна UOB (4) праворуч
  await page.getByTestId('tool-uob').click();
  await clickAt(page, { x: 940, y: 385 });
  d = await currentDiagram(page);
  const u4 = d.boxes[3];
  expect(u4.num).toBe(4);

  // зв'язки передування
  const c = async (id: string) => {
    const l = await layout(page);
    const r = l.boxes.find((b: any) => b.id === id)?.rect ?? l.junctions.find((j: any) => j.id === id)?.rect ?? l.referents.find((j: any) => j.id === id)?.rect;
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 - 6 };
  };
  await page.getByTestId("tool-link").click();
  const pairs: [string, string][] = [
    [u1.id, j1.id],
    [j1.id, u2.id],
    [j1.id, u3.id],
    [u2.id, j2.id],
    [u3.id, j2.id],
    [j2.id, u4.id],
  ];
  for (const [a, b] of pairs) {
    await clickAt(page, await c(a));
    await clickAt(page, await c(b));
  }
  d = await currentDiagram(page);
  expect(d.links).toHaveLength(6);
  expect(d.links.every((l: any) => l.kind === 'precedence')).toBe(true);

  // об'єкт-посилання та зв'язок відношення
  await page.getByTestId('tool-referent').click();
  await clickAt(page, { x: 150, y: 170 });
  d = await currentDiagram(page);
  const ref = d.referents[0];
  await page.getByTestId('prop-name').fill('Договір');
  await page.getByTestId('tool-link').click();
  await clickAt(page, await c(ref.id));
  await clickAt(page, await c(u1.id));
  d = await currentDiagram(page);
  expect(d.links).toHaveLength(7);
  expect(d.links[6].kind).toBe('relational');

  // назва і визначення зв'язку
  await page.getByTestId('tool-select').click();
  await clickAt(page, await arrowMid(page, d.links[1].id));
  await page.getByTestId('prop-arrow-label').fill('Термінове');
  await page.getByTestId('prop-arrow-definition').fill('Замовлення термінове');
  // властивості перехрестя: змінюємо J1 на O синхронне, потім назад на X
  const jr = (await layout(page)).junctions[0].rect;
  await clickAt(page, { x: jr.x + jr.w / 2, y: jr.y + jr.h / 2 });
  await page.getByTestId('junction-type').selectOption('or');
  await page.getByTestId('junction-sync').check();
  d = await currentDiagram(page);
  expect(d.junctions[0]).toMatchObject({ type: 'or', sync: true });
  await page.getByTestId('junction-type').selectOption('xor');
  await expect(page.getByTestId('junction-sync')).toBeDisabled();
  await expect(page.getByTestId('properties')).toContainText('розгалуження (fan-out)');
  const j2r = (await layout(page)).junctions[1].rect;
  await clickAt(page, { x: j2r.x + j2r.w / 2, y: j2r.y + j2r.h / 2 });
  await expect(page.getByTestId('properties')).toContainText('злиття (fan-in)');

  // визначення UOB
  await selectBox(page, u2.id);
  await page.getByTestId('prop-definition').fill('Виконується для 30% замовлень');
  d = await currentDiagram(page);
  expect(d.boxes[1].definition).toBe('Виконується для 30% замовлень');

  // відображення: символи, номери перехресть, підписи
  const texts = await svgTexts(page);
  for (const t of ['X', '&', 'J1', 'J2', 'Договір', 'Термінове']) expect(texts).toContain(t);
  // синхронне перехрестя має подвійні вертикальні лінії
  await expect(page.locator(`.diagram-svg [data-junction="${j2.id}"] line`)).toHaveCount(2);
  await expect(page.locator(`.diagram-svg [data-junction="${j1.id}"] line`)).toHaveCount(0);
  // пунктир для зв'язку відношення
  await expect(page.locator(`.diagram-svg [data-arrow="${d.links[6].id}"] polyline`)).toHaveAttribute('stroke-dasharray', '6 4');
  const lay = await layout(page);
  for (const a of lay.arrows) assertOrthogonal(a.points);

  // UOB можна декомпозувати далі в IDEF3
  await selectBox(page, u4.id);
  await page.getByTestId('decompose').click();
  await expect(page.getByTestId('decomp-idef0')).toBeDisabled();
  await page.getByTestId('decomp-count').fill('2');
  await page.getByTestId('decomp-ok').click();
  const sub = await currentDiagram(page);
  expect(sub.kind).toBe('idef3');
  await expect(page.locator('[data-box-number]')).toHaveText(['5', '6']);
  const r = await boxRect(page, sub.boxes[0].id);
  expect(r.w).toBeGreaterThan(0);
});
