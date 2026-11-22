import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fresh } from './helpers';

function pngSize(buf: Buffer) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('експорт PNG поточної діаграми: біле тло, висока роздільність', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('btn-sample').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export-png').click()]);
  expect(dl.suggestedFilename()).toBe('01 A-0 Виготовити меблі на замовлення.png');
  const buf = readFileSync((await dl.path())!);
  expect(pngSize(buf)).toEqual({ w: 3360, h: 2376 });
  // кути зображення білі (непрозоре біле тло)
  const corner = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(2, 2, 1, 1).data);
  }, buf.toString('base64'));
  expect(corner).toEqual([255, 255, 255, 255]);
});

test('експорт усіх діаграм у ZIP', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('btn-sample').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export-all').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.zip$/);
  const buf = readFileSync((await dl.path())!);
  expect(buf.subarray(0, 4).toString('hex')).toBe('504b0304');
  const names: string[] = [];
  let i = 0;
  while ((i = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i)) >= 0) {
    const len = buf.readUInt16LE(i + 28);
    names.push(buf.subarray(i + 46, i + 46 + len).toString('utf8'));
    i += 46;
  }
  expect(names).toEqual([
    '01 A-0 Виготовити меблі на замовлення.png',
    '02 A0 Виготовити меблі на замовлення.png',
    '03 A2 Виготовити меблі (IDEF3).png',
    '04 Дерево вузлів.png',
  ]);
});

test('кирилиця в PNG відображається вбудованим шрифтом (без «квадратиків»)', async ({ page }) => {
  await fresh(page);
  const svg: string = await page.evaluate(() => (window as any).kaskad.svg());
  expect(svg).toContain('@font-face');
  expect(svg).toContain('data:font/woff2;base64');
  expect(svg).toContain('U+0400-045F');

  // Рендеримо блок з різними кириличними назвами: якщо гліфи відсутні, усі символи
  // виглядали б однаковими «квадратиками» і зображення збігалися б.
  const render = async (name: string) => {
    await page.evaluate((n) => {
      const k = (window as any).kaskad;
      k.commit((m: any) => {
        m.diagrams[m.rootDiagramId].boxes[0].name = n;
      });
    }, name);
    return page.evaluate(async () => {
      const k = (window as any).kaskad;
      const url: string = await k.pngDataUrl(undefined, 2);
      const r = k.getLayout().boxes[0].rect;
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(r.x * 2 + 6, r.y * 2 + 6, r.w * 2 - 12, r.h * 2 - 40).data;
      let dark = 0;
      const sig: number[] = [];
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] < 128 ? 1 : 0;
        dark += v;
        sig.push(v);
      }
      return { dark, sig: sig.join(''), url };
    });
  };
  const a = await render('ЖЖЖ ґєї');
  const b = await render('ШШШ ПРІ');
  const lat = await render('ABC def');
  expect(a.dark).toBeGreaterThan(200);
  expect(b.dark).toBeGreaterThan(200);
  expect(a.sig).not.toBe(b.sig);
  expect(a.sig).not.toBe(lat.sig);
  writeFileSync('test-results/cyrillic-export.png', Buffer.from(a.url.split(',')[1], 'base64'));
  // текст у експорті такий самий, як на екрані (ширина «Ж» у шрифті Arimo)
  const w = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = '13px KaskadArimo';
    const w1 = c.measureText('ЖЖЖЖЖЖЖЖЖЖ').width;
    c.font = '13px monospace';
    const w2 = c.measureText('ЖЖЖЖЖЖЖЖЖЖ').width;
    return { w1, w2, ok: document.fonts.check('13px KaskadArimo', 'Ж') };
  });
  expect(w.ok).toBe(true);
  expect(w.w1).not.toBe(w.w2);
});

test('збереження і відкриття моделі .json', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('btn-sample').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-save').click()]);
  expect(dl.suggestedFilename()).toBe('Меблева майстерня.json');
  const path = (await dl.path())!;
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.format).toBe('kaskad');
  expect(Object.keys(json.diagrams)).toHaveLength(3);
  // нова модель, потім відкриваємо збережений файл
  await page.getByTestId('btn-new').click();
  await expect(page.locator('.brand-model')).toHaveText('Нова модель');
  await page.getByTestId('file-input').setInputFiles(path);
  await expect(page.locator('.brand-model')).toHaveText('Меблева майстерня');
  const m = await page.evaluate(() => (window as any).kaskad.getModel());
  expect(m).toEqual(json);
  // некоректний файл
  await page.getByTestId('file-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(page.getByTestId('toast')).toContainText('Не вдалося відкрити файл');
});
