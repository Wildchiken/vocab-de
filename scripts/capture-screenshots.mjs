// Capture real UI with disposable example data; never connects to a deployed site.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createApp } from '../server/node.mjs';
import { openD1 } from '../server/d1-sqlite.mjs';

const server = createApp({ DB: openD1(':memory:') });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
try {
  for (const lang of ['en', 'zh']) {
    const out = new URL(`../docs/screenshots/${lang}/`, import.meta.url);
    await mkdir(out, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2,
      hasTouch: true, locale: lang === 'zh' ? 'zh-CN' : 'en-US',
      timezoneId: 'Europe/Berlin', colorScheme: 'light', reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(lang => {
        localStorage.setItem('vocab-de:lang', JSON.stringify(lang));
      }, lang);
      await page.goto(base);
      await page.locator('#trySample').waitFor();
      await page.evaluate(async lang => {
        const S = await import('/js/store.js');
        const { sampleWords } = await import('/js/sample.js');
        const now = Date.now(), day = 86400000;
        const words = sampleWords(lang).map((item, i) => {
          const tag = i < 7 ? (lang === 'zh' ? '日常生活' : 'Daily life')
            : i < 16 ? (lang === 'zh' ? '出行' : 'Travel')
            : (lang === 'zh' ? '基础表达' : 'Essentials');
          const w = S.makeWord({ ...item, tags: ['A1', tag], batch: now - 12 * day });
          w.createdAt = now - 12 * day + i;
          return w;
        });
        words[0].example = 'Das Buch liegt auf dem Tisch.';
        words[0].exampleZh = lang === 'zh' ? '书放在桌子上。' : 'The book is on the table.';
        await S.addWords(words);
        await S.saveSettings({ newPerDay: 10, autoSpeak: false, sound: false });
        // Simulated sessions feed the actual scheduler and statistics.
        for (let ago = 6; ago >= 0; ago--) {
          for (let i = 0; i < 12; i++) {
            if (ago === 0 && i >= 6) continue;
            const grade = ago === 6 || (i === 5 && ago === 2) ? 1 : 3;
            await S.answer(words[i], 'meaning', grade, 8000, now - ago * day - (12 - i) * 60000,
              ago === 6 ? null : { ok: !(i === 5 && ago === 2) });
          }
        }
        const target = S.liveWords().find(w => w.lemma === 'Tisch');
        target.cards.meaning.due = 0;
        await S.saveWord(target);
      }, lang);
      async function ready(view) {
        await page.goto(base + '#' + view);
        await page.waitForFunction(view => document.body.dataset.view === view, view);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
      }
      async function capture(name) {
        await page.screenshot({ path: fileURLToPath(new URL(name + '.png', out)), animations: 'disabled' });
      }
      await ready('home');
      await page.locator('.summary-num').first().waitFor();
      await capture('home');

      await page.setViewportSize({ width: 390, height: 844 });
      await ready('study');
      await page.locator('#wordBig').filter({ hasText: 'Tisch' }).waitFor();
      await page.locator('[data-a="der"]').tap();
      assert.equal(await page.locator('.rate button').count(), 3);
      await page.waitForTimeout(350);
      await capture('study');

      await ready('words');
      await page.locator('#list .row').first().waitFor();
      await capture('words');

      await page.setViewportSize({ width: 390, height: 1000 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await ready('stats');
      await page.locator('.list-progress').first().waitFor();
      await capture('stats');
      assert.deepEqual(errors, []);
      console.log(`Captured ${lang}: home, study, words, stats`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
