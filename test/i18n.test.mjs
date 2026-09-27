import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MESSAGES, setLang, t, fmtIvl } from '../public/js/i18n.js';
import { RULE_IDS } from '../public/js/german.js';

const keys = (o) => Object.keys(o).sort();

test('zh and en have the same keys', () => {
  assert.deepEqual(keys(MESSAGES.en), keys(MESSAGES.zh));
});

test('every key used in the UI exists', () => {
  const src = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const used = new Set([...src.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]));
  // keys built at runtime
  const dynamic = [
    ...['meaning', 'article', 'spell'].map((k) => `type.${k}`),
    ...['new', 'learning', 'young', 'mature', 'suspended'].map((k) => `st.${k}`),
    ...['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'phrase', 'other'].map((k) => `pos.${k}`),
    ...['off', 'idle', 'syncing', 'pending', 'error', 'offline'].map((k) => `sync.${k}`),
    ...['token', 'server', 'network'].map((k) => `sync.err.${k}`),
    ...['ok', 'near', 'bad'].map((k) => `spell.${k}`),
    ...['case', 'noArticle', 'wrongArticle', 'oneLetter'].map((k) => `spell.why.${k}`),
    ...[1, 2, 3, 4].map((g) => `rate.${g}`),
    ...RULE_IDS.map((id) => `rule.${id}`),
  ];
  for (const k of [...used, ...dynamic]) {
    assert.ok(k in MESSAGES.zh, `missing zh: ${k}`);
    assert.ok(k in MESSAGES.en, `missing en: ${k}`);
  }
});

test('placeholders and plurals', () => {
  setLang('en');
  assert.equal(t('n.words', { n: 1 }), '1 word');
  assert.equal(t('n.words', { n: 3 }), '3 words');
  assert.equal(t('words.more', { n: 5 }), 'Show 5 more');
  assert.equal(fmtIvl(10 * 60_000), '10m');
  assert.equal(fmtIvl(4 * 86_400_000), '4d');
  setLang('zh');
  assert.equal(t('n.words', { n: 3 }), '3 个词');
  assert.equal(fmtIvl(4 * 86_400_000), '4天');
});
