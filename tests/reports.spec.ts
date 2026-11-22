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
  expect(clip.text).toContain("Ім'я роботи\tВизначення (опис)");
});

async function downloadCsv(page: any): Promise<string> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-csv').click()]);
  return readFileSync((await dl.path())!, 'utf8');
}

async function copyHtml(page: any): Promise<{ html: string; text: string }> {
  // очищаємо буфер, щоб не прочитати попередню копію
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByTestId('report-copy').click();
  let res = { html: '', text: '' };
  await expect
    .poll(async () => {
      res = await page.evaluate(async () => {
        try {
          const items = await navigator.clipboard.read();
          const item = items[0];
          if (!item || !item.types.includes('text/html')) return { html: '', text: '' };
          const html = await (await item.getType('text/html')).text();
          const text = await (await item.getType('text/plain')).text();
          return { html, text };
        } catch {
          return { html: '', text: '' };
        }
      });
      return res.html.length > 0;
    })
    .toBe(true);
  return res;
}

const headersOf = (html: string) => [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);

test('табл. 2.6 і 2.7: на екрані всі колонки, у Word і CSV — лише колонки методички', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSample(page);
  await page.getByTestId('btn-reports').click();

  // 2.6 — роботи
  await page.getByTestId('report-activities').click();
  await expect(page.getByTestId('report-table-0').locator('th')).toHaveCount(5);
  await expect(page.getByTestId('report-export-note')).toContainText('2.6');
  let csv = await downloadCsv(page);
  let lines = csv.replace('﻿', '').split('\r\n');
  expect(lines[3]).toBe("Ім'я роботи;Визначення (опис)");
  expect(lines[4]).toBe('Виготовити меблі на замовлення;Повний цикл виконання замовлення клієнта: від прийому до встановлення.');
  expect(lines.slice(3).filter(Boolean).every((l) => l.split(';').length === 2)).toBe(true);
  let clip = await copyHtml(page);
  expect(headersOf(clip.html)).toEqual(["Ім'я роботи", 'Визначення (опис)']);
  expect(clip.html).not.toContain('IDEF3 (UOB)');
  expect(clip.text.split('\n')[3]).toBe("Ім'я роботи\tВизначення (опис)");

  // 2.7 — стрілки
  await page.getByTestId('report-arrows').click();
  await expect(page.getByTestId('report-table-0').locator('th')).toHaveCount(7);
  await expect(page.getByTestId('report-export-note')).toContainText('2.7');
  csv = await downloadCsv(page);
  lines = csv.replace('﻿', '').split('\r\n');
  expect(lines[3]).toBe("Ім'я стрілки;Джерело стрілки;Тип джерела стрілки;Призначення стрілки;Тип призначення стрілки");
  expect(lines[4]).toBe('Замовлення клієнта;Зовнішнє середовище (межа A-0);Вхід;A0 Виготовити меблі на замовлення;Вхід');
  expect(csv).not.toContain('Заявка клієнта з побажаннями');
  clip = await copyHtml(page);
  expect(headersOf(clip.html)).toEqual(["Ім'я стрілки", 'Джерело стрілки', 'Тип джерела стрілки', 'Призначення стрілки', 'Тип призначення стрілки']);
});

test('табл. 2.8 «Центри витрат» і табл. 2.9 «Параметри робіт» (по рядку на пару робота + центр)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSample(page);
  await page.getByTestId('btn-reports').click();

  // 2.8
  await page.getByTestId('report-costCenters').click();
  const t = page.getByTestId('report-table-0');
  await expect(t.locator('th')).toHaveText(['Центр витрат', 'Визначення']);
  await expect(t.locator('tbody tr')).toHaveCount(2);
  await expect(t.locator('tbody tr').first().locator('td')).toHaveText(['Оплата праці', 'Заробітна плата персоналу']);
  await expect(page.getByTestId('report-scope')).toBeDisabled();
  let csv = await downloadCsv(page);
  expect(csv).toContain('Центр витрат;Визначення\r\nОплата праці;Заробітна плата персоналу\r\nМатеріали;ДСП, фурнітура, лаки та фарби');
  let clip = await copyHtml(page);
  expect(headersOf(clip.html)).toEqual(['Центр витрат', 'Визначення']);
  expect(clip.html).toContain('Заробітна плата персоналу');

  // 2.9 — 9 робіт × 2 центри витрат = 18 рядків
  await page.getByTestId('report-abcParams').click();
  await expect(t.locator('th')).toHaveText(["Ім'я роботи", 'Центр витрат', 'Вартість', 'Тривалість', 'Частота']);
  await expect(t.locator('tbody tr')).toHaveCount(18);
  const row = (i: number) => t.locator('tbody tr').nth(i).locator('td');
  await expect(row(0)).toHaveText(['A0 Виготовити меблі на замовлення *', 'Оплата праці', '1 315', '13,8', '1']);
  await expect(row(1)).toHaveText(['A0 Виготовити меблі на замовлення *', 'Матеріали', '2 745', '13,8', '1']);
  // «Пофарбувати»: частота 0,3
  await expect(t.locator('tbody tr', { hasText: 'Пофарбувати' }).first().locator('td')).toHaveText(['3 Пофарбувати', 'Оплата праці', '250', '3', '0,3']);
  csv = await downloadCsv(page);
  expect(csv).toContain("Ім'я роботи;Центр витрат;Вартість;Тривалість;Частота");
  expect(csv).toContain('3 Пофарбувати;Матеріали;400;3;0,3');
  // для обраної роботи A2: 6 робіт × 2 = 12 рядків
  await page.getByTestId('report-scope').selectOption({ label: '  A2 Виготовити меблі' });
  await expect(t.locator('tbody tr')).toHaveCount(12);
  clip = await copyHtml(page);
  expect(headersOf(clip.html)).toEqual(["Ім'я роботи", 'Центр витрат', 'Вартість', 'Тривалість', 'Частота']);
});
