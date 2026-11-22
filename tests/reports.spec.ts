import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fresh } from './helpers';

async function openSample(page: any) {
  await fresh(page);
  await page.getByTestId('btn-sample').click();
  await expect(page.locator('.brand-model')).toHaveText('Меблева майстерня');
}

test('звіти по моделі, роботах і стрілках — для всієї моделі', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('btn-reports').click();
  const view = page.getByTestId('report-view');
  // модель
  await expect(view).toContainText('Звіт по моделі');
  await expect(page.getByTestId('report-table-0')).toContainText('Меблева майстерня');
  await expect(page.getByTestId('report-table-0')).toContainText('Директор майстерні');
  await expect(page.getByTestId('report-table-0')).toContainText('Описати процес виготовлення меблів');
  const diagrams = page.getByTestId('report-table-1');
  await expect(diagrams.locator('tbody tr')).toHaveCount(4);
  await expect(diagrams).toContainText('A-0');
  await expect(diagrams).toContainText('IDEF3');
  await expect(diagrams).toContainText('Дерево вузлів');
  // роботи
  await page.getByTestId('report-activities').click();
  const acts = page.getByTestId('report-table-0');
  await expect(acts.locator('th')).toHaveText(['Номер', 'Назва роботи', 'Визначення', 'Нотація', 'Діаграма']);
  await expect(acts.locator('tbody tr')).toHaveCount(1 + 3 + 5);
  await expect(acts.locator('tbody tr').first().locator('td')).toHaveText([
    'A0',
    'Виготовити меблі на замовлення',
    'Повний цикл виконання замовлення клієнта: від прийому до встановлення.',
    'IDEF0',
    'A-0',
  ]);
  await expect(acts).toContainText('Пофарбувати');
  await expect(acts).toContainText('IDEF3 (UOB)');
  // стрілки
  await page.getByTestId('report-arrows').click();
  const arrows = page.getByTestId('report-table-0');
  await expect(arrows.locator('th')).toHaveText(['Назва стрілки', 'Джерело', 'Тип джерела', 'Призначення', 'Тип призначення', 'Визначення', 'Діаграма']);
  const row = arrows.locator('tbody tr').first().locator('td');
  await expect(row).toHaveText([
    'Замовлення клієнта',
    'Зовнішнє середовище (межа A-0)',
    'Вхід',
    'A0 Виготовити меблі на замовлення',
    'Вхід',
    'Заявка клієнта з побажаннями щодо виробу.',
    'A-0',
  ]);
  await expect(arrows).toContainText('Управління');
  await expect(arrows).toContainText('Механізм');
  await expect(arrows).toContainText('Вихід');
  await expect(arrows).toContainText("Зв'язок IDEF3 (передування)");
  await expect(arrows).toContainText('Межа діаграми A0 (I1)');
  await expect(arrows).toContainText('Розгалуження стрілки «Персонал»');
  await expect(arrows).toContainText('Потрібне фарбування');
});

test('звіти для обраної роботи з декомпозицією, CSV та копіювання для Word', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSample(page);
  await page.getByTestId('btn-reports').click();
  await page.getByTestId('report-activities').click();
  await page.getByTestId('report-scope').selectOption({ label: '  A2 Виготовити меблі' });
  const table = page.getByTestId('report-table-0');
  await expect(table.locator('tbody tr')).toHaveCount(1 + 5);
  await expect(table).not.toContainText('Прийняти та оформити');
  await expect(page.getByTestId('report-scope-label')).toHaveText('Робота A2 «Виготовити меблі» з декомпозицією');
  // стрілки: приєднані до A2 + зв'язки IDEF3
  await page.getByTestId('report-arrows').click();
  await expect(table).toContainText('Матеріали');
  await expect(table).toContainText('Потрібне лакування');
  await expect(table).not.toContainText('Рахунок клієнту');
  // модель: лише діаграми піддерева
  await page.getByTestId('report-model').click();
  await expect(page.getByTestId('report-table-1').locator('tbody tr')).toHaveCount(1);
  // ABC для A2
  await page.getByTestId('report-abc').click();
  await expect(table.locator('tbody tr')).toHaveCount(6);
  // A2 = 150+2000 + 400+300 + 0.3×650 + 0.7×450 + 150 = 3510
  await expect(table.locator('tbody tr').first()).toContainText('3 510');

  // CSV
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-csv').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  const csv = readFileSync((await dl.path())!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('Номер;Робота;Оплата праці, грн;Матеріали, грн;Разом, грн;Тривалість, години;Частота');
  expect(csv).toContain('A2');
  expect(csv).toContain('Робота A2 «Виготовити меблі» з декомпозицією');

  // копіювання для Word (HTML + текст)
  await page.getByTestId('report-activities').click();
  await page.getByTestId('report-copy').click();
  await expect(page.getByTestId('toast')).toContainText('скопійовано');
  const clip = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const html = await (await items[0].getType('text/html')).text();
    const text = await navigator.clipboard.readText();
    return { html, text };
  });
  expect(clip.html).toContain('<table');
  expect(clip.html).toContain('Розкроїти матеріал');
  expect(clip.text).toContain('Номер\tНазва роботи');
});
