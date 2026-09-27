import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE, sampleWords } from '../public/js/sample.js';
import { ARTICLES, isIncomplete } from '../public/js/german.js';

test('sample words are complete and unique', () => {
  const lemmas = SAMPLE.map((s) => s[1]);
  assert.equal(new Set(lemmas).size, lemmas.length);
  for (const lang of ['zh', 'en']) {
    for (const w of sampleWords(lang)) {
      assert.ok(!isIncomplete(w), `${w.lemma} (${lang})`);
      if (w.pos === 'noun') assert.ok(ARTICLES.includes(w.article) && w.plural, w.lemma);
    }
  }
});
