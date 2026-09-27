import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, pluralFromSpec, umlautize, checkSpelling, articleRule } from '../public/js/german.js';

test('umlaut', () => {
  assert.equal(umlautize('Apfel'), 'Äpfel');
  assert.equal(umlautize('Haus'), 'Häus');
  assert.equal(umlautize('Mutter'), 'Mütter');
  assert.equal(umlautize('Stadt'), 'Städt');
  assert.equal(umlautize('Saal'), 'Säl');
});

test('plural spec', () => {
  assert.equal(pluralFromSpec('Tisch', '-e'), 'Tische');
  assert.equal(pluralFromSpec('Haus', '¨-er'), 'Häuser');
  assert.equal(pluralFromSpec('Buch', '-¨er'), 'Bücher');
  assert.equal(pluralFromSpec('Lehrer', '-'), 'Lehrer');
  assert.equal(pluralFromSpec('Mutter', '¨'), 'Mütter');
  assert.equal(pluralFromSpec('Milch', 'nur Sg.'), '—');
  assert.equal(pluralFromSpec('Auto', '-s'), 'Autos');
});

test('parse lines', () => {
  let p = parseLine('der Tisch, -e 桌子');
  assert.deepEqual([p.article, p.lemma, p.plural, p.zh, p.pos], ['der', 'Tisch', 'Tische', '桌子', 'noun']);
  p = parseLine('die Mutter, ¨ – 母亲');
  assert.deepEqual([p.article, p.lemma, p.plural, p.zh], ['die', 'Mutter', 'Mütter', '母亲']);
  p = parseLine('der Lehrer, - 老师');
  assert.equal(p.plural, 'Lehrer');
  p = parseLine('der Abend, -e  Am Abend sehe ich fern.');
  assert.equal(p.plural, 'Abende');
  assert.equal(p.example, 'Am Abend sehe ich fern.');
  p = parseLine('gehen, ging, ist gegangen 走');
  assert.deepEqual([p.lemma, p.pos, p.forms, p.zh], ['gehen', 'verb', 'ging, ist gegangen', '走']);
  p = parseLine('das Haus\t房子');
  assert.deepEqual([p.article, p.lemma, p.zh], ['das', 'Haus', '房子']);
  p = parseLine('Tisch');
  assert.deepEqual([p.lemma, p.pos, p.article], ['Tisch', 'noun', '']);
  p = parseLine('das Kind (-er) 孩子');
  assert.equal(p.plural, 'Kinder');
  p = parseLine('der Tisch, die Tische 桌子');
  assert.equal(p.plural, 'Tische');
  assert.equal(parseLine('# 注释'), null);
  assert.equal(parseLine('   '), null);
});

test('parse lines with non-Chinese meanings', () => {
  let p = parseLine('der Tisch, -e - table');
  assert.deepEqual([p.article, p.lemma, p.plural, p.zh], ['der', 'Tisch', 'Tische', 'table']);
  p = parseLine('der Lehrer, - teacher');
  assert.deepEqual([p.plural, p.zh], ['Lehrer', 'teacher']);
  p = parseLine('gehen, ging, ist gegangen = to go');
  assert.deepEqual([p.lemma, p.forms, p.zh], ['gehen', 'ging, ist gegangen', 'to go']);
  p = parseLine('die Zeitung\tnewspaper');
  assert.deepEqual([p.article, p.lemma, p.zh], ['die', 'Zeitung', 'newspaper']);
  p = parseLine('Zeitung: newspaper');
  assert.deepEqual([p.lemma, p.zh], ['Zeitung', 'newspaper']);
  p = parseLine('sich freuen (über) - to be glad (about)');
  assert.deepEqual([p.lemma, p.zh], ['sich freuen (über)', 'to be glad (about)']);
  p = parseLine('das Kind (-er) - child');
  assert.deepEqual([p.plural, p.zh], ['Kinder', 'child']);
});

test('spelling', () => {
  const w = { pos: 'noun', article: 'die', lemma: 'Tür' };
  assert.equal(checkSpelling('die Tür', w).result, 'exact');
  assert.equal(checkSpelling('die Tuer', w).result, 'near');
  assert.equal(checkSpelling('Tür', w).result, 'near');
  assert.equal(checkSpelling('der Tür', w).result, 'wrong');
});

test('article rules', () => {
  assert.equal(articleRule('Zeitung').article, 'die');
  assert.equal(articleRule('Mädchen').article, 'das');
  assert.equal(articleRule('Frühling').article, 'der');
  assert.equal(articleRule('Tisch'), null);
});
