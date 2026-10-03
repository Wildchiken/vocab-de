// Browser smoke test: the real pages against the Node server, in Chromium and WebKit.
//   npx playwright install chromium webkit   (once)
//   npm run test:e2e
// It checks what unit tests can't: the screens render, buttons don't react to the second tap
// of a double-tap, the strict content security policy blocks nothing, and files import.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';
import { createApp } from '../server/node.mjs';
import { openD1 } from '../server/d1-sqlite.mjs';

const server = createApp({ SYNC_TOKEN: 'smoke', SYNC_OPEN: '1', DB: openD1(':memory:') });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const dir = await mkdtemp(join(tmpdir(), 'vocab-de-'));
const csv = join(dir, 'reise.csv');
await writeFile(csv, 'article,lemma,plural,meaning\nder,Bahnhof,Bahnhöfe,train station\ndie,Fahrkarte,-n,ticket\n');

const logCount = (page) => page.evaluate(async () => (await import('/js/store.js')).state.logs.length);
let failed = false;

async function run(name, engine) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, locale: 'en-US' });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP blocked ${e.violatedDirective} ${e.blockedURI}`)),
    );

    const response = await page.goto(base);
    assert.match(response.headers()['content-security-policy'], /script-src 'self'/);

    // Home: try the sample words, numbers are numbers
    await page.locator('#trySample').tap();
    await page.waitForSelector('.summary-num');
    for (const n of await page.locator('.summary-num').allTextContents()) assert.match(n, /^\d+$/, `home number "${n}"`);

    // Every screen renders
    for (const hash of ['words', 'add', 'formats', 'stats', 'settings']) {
      await page.evaluate((h) => (location.hash = `#${h}`), hash);
      await page.waitForFunction((h) => document.body.dataset.view === h, hash);
      assert.ok((await page.locator('#app').innerText()).length > 20, `${hash} is empty`);
    }

    // First sight of a noun shows its article; the second tap of a double-tap does nothing
    await page.evaluate(() => (location.hash = '#study'));
    await page.locator('#reveal').waitFor();
    assert.match(await page.locator('#wordBig').innerText(), /^der Tisch$/);
    await page.locator('#reveal').dblclick();
    await page.locator('.rate').waitFor();
    assert.equal(await logCount(page), 0, 'double-tap on "show answer" rated the card');

    // Not knowing it brings the word back, and now its article is asked
    await page.waitForTimeout(450);
    await page.locator('.rate .r1').tap();
    await page.locator('#reveal, #known').first().waitFor();
    await page.evaluate(async () => {
      const S = await import('/js/store.js');
      const w = S.liveWords().find((x) => x.lemma === 'Tisch');
      w.cards.meaning.recheck = Date.now() - 1000;
      await S.saveWord(w);
    });
    await page.evaluate(() => (location.hash = '#home'));
    await page.evaluate(() => (location.hash = '#study'));
    await page.locator('.art-btn').first().waitFor();
    assert.equal(await page.locator('.art-btn').count(), 3);
    await page.waitForTimeout(450);
    const before = await logCount(page);
    const wrong = await page.evaluate(async () => {
      const S = await import('/js/store.js');
      return ['der', 'die', 'das'].find((a) => a !== S.liveWords().find((x) => x.lemma === 'Tisch').article);
    });
    await page.locator(`.art-btn.b-${wrong}`).dblclick();
    await page.locator('.rate').waitFor();
    assert.equal(await page.locator('.rate button').count(), 2, 'a wrong article should leave only Don\'t know / Fuzzy');
    assert.equal(await logCount(page), before, 'double-tap on an article rated the card');
    await page.waitForTimeout(450);
    await page.locator('.rate .r2').tap();
    const log = await page.evaluate(async () => (await import('/js/store.js')).state.logs.at(-1));
    assert.deepEqual([log.t, log.st, log.g, log.a], ['meaning', 'recheck', 2, 0]);

    // Finish the round: the missed words are listed
    for (let i = 0; i < 80 && !(await page.locator('.finish').count()); i++) {
      await page.waitForTimeout(400);
      if (await page.locator('.rate').count()) await page.locator('.rate button').last().tap();
      else if (await page.locator('#skipArt').count()) await page.locator('#skipArt').tap();
      else if (await page.locator('#reveal').count()) await page.locator('#reveal').tap();
    }
    await page.locator('.finish').waitFor();

    // Practice from the word list: revealing and rating right away are different buttons, so both count
    await page.evaluate(() => (location.hash = '#words'));
    await page.locator('#selectBtn').tap();
    await page.locator('#list .pick').first().tap();
    await page.locator('#selPractice').tap();
    await page.locator('#reveal').tap();
    await page.locator('#gotIt').tap();
    await page.locator('#again').waitFor();

    // Import a file
    await page.evaluate(() => (location.hash = '#add'));
    await page.locator('#fileInput').setInputFiles(csv);
    await page.waitForSelector('#pvHead');
    assert.match(await page.locator('#fileCols').innerText(), /German/i);
    await page.locator('#import').tap();
    assert.ok(
      await page.evaluate(async () => (await import('/js/store.js')).liveWords().some((w) => w.lemma === 'Fahrkarte' && w.plural === 'Fahrkarten')),
    );

    // Prefill from a link, dictionary links on the edit page
    await page.evaluate(() => (location.hash = '#add?text=die%20Haltestelle&example=Die%20Haltestelle%20ist%20dort.&tag=Reise'));
    await page.waitForSelector('#pvHead');
    assert.equal(await page.locator('#tags').inputValue(), 'Reise');
    const id = await page.evaluate(async () => (await import('/js/store.js')).liveWords().find((w) => w.lemma === 'Bahnhof').id);
    await page.evaluate((i) => (location.hash = `#word/${i}`), id);
    const links = page.locator('a[target=_blank]');
    await links.first().waitFor();
    for (const rel of await links.evaluateAll((els) => els.map((a) => a.rel))) assert.match(rel, /noopener/);

    // Word list progress
    await page.evaluate(() => (location.hash = '#stats'));
    await page.locator('.list-progress').first().waitFor();

    // Sync: every password is its own library, so two people never see each other's words
    const wordCount = (p) => p.evaluate(async () => (await import('/js/store.js')).liveWords().length);
    const connect = async (p, token) => {
      await p.evaluate(() => (location.hash = '#settings'));
      await p.locator('#syncSwitch').check();
      if (token) await p.locator('#token').fill(token);
      else await p.locator('#genToken').tap();
      const used = await p.locator('#token').inputValue();
      await p.locator('#tokenBtn').tap();
      await p.waitForFunction(() => document.getElementById('syncBtn').dataset.status === 'idle');
      return used;
    };
    const alice = await connect(page, '');
    assert.ok(alice.length >= 16, 'generated password is long enough');
    // Switching a device that has words to another password asks first; cancelling keeps the old one
    await page.evaluate(() => (location.hash = '#settings'));
    await page.locator('#token').fill('some-other-password-123');
    await page.locator('#tokenBtn').tap();
    await page.locator('.dialog').waitFor();
    await page.locator('.dialog [data-ok="0"]').tap();
    assert.equal(await page.evaluate(async () => (await import('/js/sync.js')).sync.token), alice);
    const other = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, locale: 'en-US' });
    const second = await other.newPage();
    await second.goto(base);
    await connect(second, '');
    assert.equal(await wordCount(second), 0, "another password must not see Alice's words");
    const third = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, locale: 'en-US' })).newPage();
    await third.goto(base);
    await connect(third, alice);
    await third.waitForFunction(async () => (await import('/js/store.js')).liveWords().length > 20);
    assert.equal(await wordCount(third), await wordCount(page), "Alice's other device gets her words");
    await other.close();

    // Erasing with sync on empties the cloud library, and the other devices clear themselves too
    const syncAs = (p) => p.evaluate(async () => (await import('/js/sync.js')).syncNow());
    await page.evaluate(() => (location.hash = '#settings'));
    await page.locator('#wipe').tap();
    await page.locator('.dialog [data-ok="1"]').tap();
    await page.waitForFunction(async () => (await import('/js/store.js')).liveWords().length === 0);
    await page.waitForTimeout(500);
    assert.equal(await wordCount(page), 0, 'erased words came back');
    assert.equal(await page.evaluate(async () => (await import('/js/sync.js')).sync.token), alice, 'the device should stay connected');
    await syncAs(third);
    await third.waitForFunction(async () => (await import('/js/store.js')).liveWords().length === 0);

    // Words added after the erase reach the other device although the library counts from 1 again
    await page.evaluate(async () => {
      const S = await import('/js/store.js');
      await S.addWords([S.makeWord({ lemma: 'Neu', zh: 'new' }), S.makeWord({ lemma: 'Alt', zh: 'old' })]);
    });
    await syncAs(page);
    await syncAs(third);
    await third.waitForFunction(async () => (await import('/js/store.js')).liveWords().length === 2);
    await third.context().close();

    // A device with words of its own, connecting to a library that has words, is asked first
    const fourth = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, locale: 'en-US' })).newPage();
    await fourth.goto(base);
    await fourth.locator('#trySample').tap();
    await fourth.waitForFunction(async () => (await import('/js/store.js')).liveWords().length === 20);
    await fourth.evaluate(() => (location.hash = '#settings'));
    await fourth.locator('#syncSwitch').check();
    await fourth.locator('#token').fill(alice);
    await fourth.locator('#tokenBtn').tap();
    await fourth.locator('.dialog').waitFor();
    assert.equal(await fourth.locator('.dialog button').count(), 3);
    await fourth.locator('.dialog [data-ok="2"]').tap();
    await fourth.waitForFunction(() => document.getElementById('syncBtn').dataset.status === 'idle');
    await fourth.waitForFunction(async () => (await import('/js/store.js')).liveWords().length === 2);
    assert.ok(
      await fourth.evaluate(async () => (await import('/js/store.js')).liveWords().every((w) => ['Neu', 'Alt'].includes(w.lemma))),
      'the words of this device should have been dropped',
    );
    await fourth.context().close();

    assert.deepEqual(problems, [], 'errors in the page');
    console.log(`PASS ${name}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${name}:`, err.message);
  } finally {
    await browser.close();
  }
}

await run('chromium', chromium);
await run('webkit', webkit);
server.close();
process.exit(failed ? 1 : 0);
