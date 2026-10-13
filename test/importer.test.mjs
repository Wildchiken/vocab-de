import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, itemsFromText, decodeText, toCSV, TEMPLATE_HEADER, updateFor, posFromName } from '../public/js/importer.js';

test('CSV with quotes, escaped quotes and embedded newlines', () => {
  const rows = parseCSV('a,b\n"der Tisch, -e","say ""hi""\nthere"\r\nx,y');
  assert.deepEqual(rows, [['a', 'b'], ['der Tisch, -e', 'say "hi"\nthere'], ['x', 'y']]);
});

test('round trip of the app\'s own CSV export', () => {
  const csv =
    '﻿article,lemma,plural,pos,forms,meaning,example,example_translation,tags,status\n' +
    '"der","Tisch","Tische","noun","","桌子","Der Tisch ist neu.","桌子是新的。","Goethe B1;A1","new"\n' +
    '"","gehen","","verb","ging, ist gegangen","走","","","",""';
  const { items, format } = itemsFromText(decodeText(new TextEncoder().encode(csv)), 'words.csv');
  assert.equal(format, 'table');
  assert.deepEqual(
    items.map((i) => [i.article, i.lemma, i.plural, i.pos, i.forms, i.zh, i.example, i.exampleZh, i.tags]),
    [
      ['der', 'Tisch', 'Tische', 'noun', '', '桌子', 'Der Tisch ist neu.', '桌子是新的。', ['Goethe B1', 'A1']],
      ['', 'gehen', '', 'verb', 'ging, ist gegangen', '走', '', '', []],
    ],
  );
});

test('Anki plain-text export: header lines, tabs and HTML', () => {
  const txt = '#separator:tab\n#html:true\nder Hund, -e\tdog<br>hound\nWie geht&nbsp;es dir?\t<b>How are you?</b>\n';
  const { items } = itemsFromText(txt, 'deck.txt');
  assert.deepEqual(
    items.map((i) => [i.article, i.lemma, i.plural, i.pos, i.zh]),
    [
      ['der', 'Hund', 'Hunde', 'noun', 'dog; hound'],
      ['', 'Wie geht es dir?', '', 'sentence', 'How are you?'],
    ],
  );
});

test('two columns without a header, semicolon separated', () => {
  const { items, format } = itemsFromText('die Tür, -en;门;Mach die Tür zu.;关门。\nauf jeden Fall;无论如何', 'list.csv');
  assert.equal(format, 'columns');
  assert.deepEqual(
    items.map((i) => [i.article, i.lemma, i.plural, i.zh, i.example, i.exampleZh, i.pos]),
    [
      ['die', 'Tür', 'Türen', '门', 'Mach die Tür zu.', '关门。', 'noun'],
      ['', 'auf jeden Fall', '', '无论如何', '', '', 'phrase'],
    ],
  );
});

test('plain text lines go through the line parser', () => {
  const { items, format } = itemsFromText('der Tisch, -e 桌子\r\nDas ist mir egal. = 我无所谓\n\n# note\n', 'notes.txt');
  assert.equal(format, 'lines');
  assert.deepEqual(items.map((i) => [i.lemma, i.pos, i.zh]), [
    ['Tisch', 'noun', '桌子'],
    ['Das ist mir egal.', 'sentence', '我无所谓'],
  ]);
});

test('GB18030 encoded file from Excel is decoded', () => {
  // "桌子" in GB18030
  const bytes = new Uint8Array([0x54, 0x69, 0x73, 0x63, 0x68, 0x2c, 0xd7, 0xc0, 0xd7, 0xd3]);
  assert.equal(decodeText(bytes), 'Tisch,桌子');
});

test('plural column: markers are expanded and a dash means no plural', () => {
  const csv = 'article,lemma,plural,meaning\nder,Tisch,-e,table\ndie,Stadt,¨-e,city\ndas,Wasser,—,water\ndas,Kind,Kinder,child';
  const { items, columns } = itemsFromText(csv, 'list.csv');
  assert.deepEqual(items.map((i) => i.plural), ['Tische', 'Städte', '—', 'Kinder']);
  assert.deepEqual(columns, ['article', 'lemma', 'plural', 'zh']);
});

test('the template imports cleanly', () => {
  const rows = [TEMPLATE_HEADER, ['die', 'Stadt', '¨-e', 'noun', '', '城市', '', '', 'die Hauptstadt 首都', '第1课;A1'], ['', 'Wie geht es dir?', '', 'sentence', '', '你好吗？', '', '', '', '第1课']];
  const { items, format } = itemsFromText(decodeText(new TextEncoder().encode(toCSV(rows))), 'template.csv');
  assert.equal(format, 'table');
  assert.deepEqual(items.map((i) => [i.article, i.lemma, i.plural, i.pos, i.notes, i.tags]), [
    ['die', 'Stadt', 'Städte', 'noun', 'die Hauptstadt 首都', ['第1课', 'A1']],
    ['', 'Wie geht es dir?', '', 'sentence', '', ['第1课']],
  ]);
});

test('notes, a suspended status and word classes written out are read from a table', () => {
  const csv = '德语,释义,词性,笔记,状态\nTisch,桌子,名词,Esstisch 餐桌,已暂停\nlaufen,跑,Verb,,new\nschnell,快,adj.,,\nob,是否,连词,,';
  const { items, columns } = itemsFromText(csv, 'liste.csv');
  assert.deepEqual(columns, ['lemma', 'pos', 'zh', 'notes', 'status']);
  assert.deepEqual(
    items.map((i) => [i.lemma, i.pos, i.notes, Boolean(i.suspended)]),
    [
      ['Tisch', 'noun', 'Esstisch 餐桌', true],
      ['laufen', 'verb', '', false],
      ['schnell', 'adj', '', false],
      ['ob', 'conj', '', false],
    ],
  );
  assert.equal(posFromName('Substantiv'), 'noun');
  assert.equal(posFromName('irgendwas'), '');
});

test('a list row fills in or updates a word already in the library, and never erases', () => {
  const word = { lemma: 'Tisch', article: 'der', plural: 'Tische', pos: 'noun', zh: '桌子', example: '', notes: 'mine', tags: ['A1'], suspended: false };
  const row = { lemma: 'Tisch', article: 'der', plural: '', zh: '桌子；台子', example: 'Der Tisch ist neu.', notes: '', tags: ['Lektion 3'] };
  assert.deepEqual(updateFor(word, row, 'skip'), {});
  // only what is empty, and the tags of the row and of the batch
  assert.deepEqual(updateFor(word, row, 'fill', ['B1']), { example: 'Der Tisch ist neu.', tags: ['A1', 'Lektion 3', 'B1'] });
  // what the file has replaces; its empty cells leave the plural and the notes alone
  assert.deepEqual(updateFor(word, row, 'replace'), { zh: '桌子；台子', example: 'Der Tisch ist neu.', tags: ['A1', 'Lektion 3'] });
  // nothing new: no change at all
  assert.deepEqual(updateFor(word, { ...word, tags: ['A1'] }, 'replace'), {});
  assert.deepEqual(updateFor(word, { suspended: true }, 'fill'), { suspended: true });
});
