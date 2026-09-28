// Reading word lists from files: plain text, TSV (e.g. Anki "Notes in Plain Text"),
// CSV with or without a header, including this app's own CSV export.
import { parseLine, pluralFromSpec, ARTICLES, NO_PLURAL } from './german.js';

// Excel on Chinese Windows still saves CSV as GB18030; try UTF-8 strictly first.
export function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    for (const encoding of ['gb18030', 'big5', 'windows-1252']) {
      try {
        return new TextDecoder(encoding, { fatal: true }).decode(bytes);
      } catch {}
    }
    return new TextDecoder().decode(bytes);
  }
}

export function parseCSV(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Column names we understand, in English, German and Chinese.
const COLUMNS = {
  article: ['article', 'artikel', '冠词'],
  lemma: ['lemma', 'word', 'german', 'deutsch', 'wort', 'front', 'term', '德语', '单词', '词'],
  plural: ['plural', '复数'],
  pos: ['pos', 'type', 'wortart', '词性'],
  forms: ['forms', 'formen', '变化', '变位'],
  zh: ['meaning', 'translation', 'back', 'definition', 'zh', 'chinese', 'english', 'bedeutung', '释义', '中文', '意思', '翻译'],
  example: ['example', 'beispiel', 'sentence', '例句'],
  exampleZh: ['example_translation', 'example translation', '例句翻译'],
  tags: ['tags', 'tag', '标签'],
};
// The plural column may hold the full form, a dictionary marker (-e, ¨-er, -) or, as in this
// app's export, a dash for "no plural".
function plural(lemma, raw) {
  if (!raw) return '';
  if (raw === NO_PLURAL) return NO_PLURAL;
  return pluralFromSpec(lemma, raw);
}

const POS = ['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'phrase', 'sentence', 'other'];

function headerMap(row) {
  const map = {};
  row.forEach((name, i) => {
    const key = name.trim().toLowerCase();
    for (const [field, names] of Object.entries(COLUMNS)) if (names.includes(key) && !(field in map)) map[field] = i;
  });
  return 'lemma' in map ? map : null;
}

// Anki exports keep simple HTML in fields.
const clean = (s) =>
  String(s ?? '')
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

function fromColumns(row, map) {
  const get = (field) => (field in map ? clean(row[map[field]]) : '');
  const lemma = get('lemma');
  if (!lemma) return null;
  // The German column may itself be "der Tisch, -e"; let the line parser read it.
  const parsed = parseLine(`${lemma}\t${get('zh') || '-'}`) || {};
  const article = get('article').toLowerCase();
  const pos = get('pos').toLowerCase();
  const word = parsed.lemma || lemma;
  return {
    ...parsed,
    raw: row.join(' ').trim(),
    lemma: word,
    article: ARTICLES.includes(article) ? article : parsed.article || '',
    plural: plural(word, get('plural')) || parsed.plural || '',
    pos: POS.includes(pos) ? pos : parsed.pos || '',
    forms: get('forms') || parsed.forms || '',
    zh: get('zh'),
    example: get('example') || parsed.example || '',
    exampleZh: get('exampleZh'),
    tags: get('tags')
      .split(/[;,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

// Template in the same columns as the CSV export, so both directions share one format.
export const TEMPLATE_HEADER = ['article', 'lemma', 'plural', 'pos', 'forms', 'meaning', 'example', 'example_translation', 'tags'];

export function toCSV(rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // BOM so Excel opens UTF-8 with umlauts and Chinese intact
  return '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** Returns { items, format, columns } for a file's text; columns are the fields recognized. */
export function itemsFromText(text, name = '') {
  const lines = text.split(/\r?\n/);
  const first = lines.find((l) => l.trim() && !l.startsWith('#')) || '';
  const ext = name.toLowerCase().split('.').pop();
  const delimiter = first.includes('\t') ? '\t' : ext === 'csv' || ext === 'tsv' ? (first.split(';').length > first.split(',').length ? ';' : ',') : null;

  if (delimiter) {
    const rows = parseCSV(lines.filter((l) => !l.startsWith('#')).join('\n'), delimiter);
    const map = headerMap(rows[0] || []);
    if (map) {
      const columns = Object.keys(COLUMNS).filter((f) => f in map);
      return { items: rows.slice(1).map((r) => fromColumns(r, map)).filter(Boolean), format: 'table', columns };
    }
    // No header: German, meaning, and optionally example and its translation.
    const items = rows
      .map((r) => fromColumns(r, { lemma: 0, zh: 1, example: 2, exampleZh: 3 }))
      .filter(Boolean);
    const width = Math.min(4, Math.max(...rows.map((r) => r.filter((c) => c.trim()).length)));
    return { items, format: 'columns', columns: ['lemma', 'zh', 'example', 'exampleZh'].slice(0, Math.max(2, width)) };
  }
  return { items: lines.map((l) => parseLine(clean(l))).filter(Boolean), format: 'lines', columns: [] };
}

export async function itemsFromFile(file) {
  const text = decodeText(new Uint8Array(await file.arrayBuffer()));
  return itemsFromText(text, file.name);
}
