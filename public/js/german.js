// German-specific helpers: parsing word list lines, plurals, article rules, spelling checks.

export const ARTICLES = ['der', 'die', 'das'];
export const NO_PLURAL = '—';

const CJK = /[㐀-鿿豈-﫿]/;
const PLURAL_SPEC = /^(?:-|–|—|-?[¨"]-?[a-zäöüß]*|-[a-zäöüß]+)$/;
const NO_PLURAL_SPEC = /^(?:nur\s*Sg\.?|o\.\s*Pl\.?|ohne\s*Pl\.?|kein\s*Pl\.?|Sg\.?|nur\s*Singular)/i;

const UMLAUT = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };

// Apfel → Äpfel, Haus → Häus (then -er), Stadt → Städt
export function umlautize(word) {
  const ending = word.match(/(er|el|en|e)$/)?.[0] ?? '';
  const stem = word.slice(0, word.length - ending.length);
  const m = stem.match(/^(.*?)(au|Au|aa|Aa|oo|a|o|u|A|O|U)([^aeiouäöüyAEIOUÄÖÜ]*)$/);
  if (!m) return word;
  const [, pre, v, post] = m;
  let nv;
  if (v.toLowerCase() === 'au') nv = UMLAUT[v[0]] + 'u';
  else if (v.toLowerCase() === 'aa') nv = UMLAUT[v[0]];
  else if (v.toLowerCase() === 'oo') nv = UMLAUT[v[0]];
  else nv = UMLAUT[v];
  return pre + nv + post + ending;
}

// Expands dictionary plural markers (-e, ¨-er, -, -n, ...) to the full plural.
export function pluralFromSpec(lemma, spec) {
  spec = spec.trim();
  if (!spec) return '';
  if (NO_PLURAL_SPEC.test(spec)) return NO_PLURAL;
  if (/^(?:-|–|—)$/.test(spec)) return lemma;
  if (/^[A-ZÄÖÜ]/.test(spec)) return spec;
  const umlaut = /[¨"]/.test(spec);
  const suffix = spec.replace(/[-–¨"]/g, '');
  return (umlaut ? umlautize(lemma) : lemma) + suffix;
}

// Separator between the German and its meaning. A "-" right after a comma is a plural
// marker ("der Lehrer, -"), not a separator.
const SEP = /(?<![,，])(?:\s+[-–—=|]\s+|\s*[:：=]\s+)/;

/**
 * Parses one line of a word list. The meaning may be in any language; it is stored in `zh`
 * for backward compatibility. Examples:
 *   der Tisch, -e 桌子
 *   der Tisch, -e - table
 *   der Lehrer, - teacher
 *   der Abend, -e  Am Abend sehe ich fern.   (Goethe list: a sentence becomes the example)
 *   gehen, ging, ist gegangen = to go
 *   Zeitung
 */
export function parseLine(raw) {
  let line = raw.replace(/ /g, ' ').trim();
  if (!line || line.startsWith('#')) return null;
  line = line.replace(/^\d+[.)、]\s*/, '');

  let de = line;
  let zh = '';
  const tabs = line.split('\t').map((s) => s.trim()).filter(Boolean);
  if (tabs.length > 1) {
    de = tabs[0];
    zh = tabs.slice(1).join('；');
  } else {
    const i = line.search(CJK);
    const m = line.match(SEP);
    if (i === 0) return null;
    if (i > 0 && (!m || i < m.index)) {
      de = line.slice(0, i);
      zh = line.slice(i).trim();
    } else if (m) {
      de = line.slice(0, m.index);
      zh = line.slice(m.index + m[0].length).trim();
    }
  }
  de = de.trim();
  while (/\s[-=:：—–|/]$/.test(de) && !/,\s*[-–—]$/.test(de)) de = de.slice(0, -1).trim();
  de = de.replace(/[：:=|]$/, '').trim();

  const item = { raw: raw.trim(), lemma: '', article: '', plural: '', pos: '', forms: '', zh, example: '', exampleZh: '' };

  let parenSpec = '';
  if (/^(der|die|das)\s/i.test(de)) {
    de = de.replace(/\s*\(([^)]*)\)\s*$/, (_, s) => {
      parenSpec = s.trim();
      return '';
    });
  }

  const parts = de.split(/\s*,\s*/);
  const head = parts[0].trim();
  const rest = parts.slice(1);
  const am = head.match(/^(der|die|das)\s+(.+)$/i);

  if (am) {
    item.article = am[1].toLowerCase();
    item.lemma = am[2].trim();
    item.pos = 'noun';
    let spec = parenSpec;
    if (!spec && rest.length) {
      const first = rest[0];
      if (/^die\s+\S/i.test(first)) {
        spec = first.split(/\s+/)[1];
        rest[0] = first.split(/\s+/).slice(2).join(' ');
      } else if (NO_PLURAL_SPEC.test(first)) {
        spec = first.match(NO_PLURAL_SPEC)[0];
        rest[0] = first.slice(spec.length);
      } else {
        const tok = first.split(/\s+/)[0];
        if (PLURAL_SPEC.test(tok)) {
          spec = tok;
          rest[0] = first.slice(tok.length);
        }
      }
    }
    if (spec) item.plural = pluralFromSpec(item.lemma, spec);
    // Whatever follows the plural is an example if it looks like a sentence, else the meaning.
    const tail = rest.join(', ').trim();
    if (/[.!?]$/.test(tail) && tail.split(/\s+/).length >= 3) item.example = tail;
    else if (tail && !item.zh) item.zh = tail;
  } else {
    item.lemma = head;
    if (rest.length && /^[a-zäöüß]/.test(head)) {
      item.pos = 'verb';
      item.forms = rest.join(', ');
    } else if (/^[A-ZÄÖÜ]/.test(head) && !head.includes(' ')) {
      item.pos = 'noun';
    } else if (/^sich\s/.test(head)) {
      item.pos = 'verb';
    }
  }
  if (!item.lemma) return null;
  return item;
}

// A word needs a meaning, and nouns need an article, before it is useful.
export function isIncomplete(item) {
  return !item.zh || (item.pos === 'noun' && !item.article);
}

export function displayWord(w) {
  return w.pos === 'noun' && w.article ? `${w.article} ${w.lemma}` : w.lemma;
}

export function pluralText(w) {
  if (w.pos !== 'noun' || !w.plural) return '';
  if (w.plural === NO_PLURAL) return NO_PLURAL;
  return `die ${w.plural}`;
}

// Ending rules for articles. Each id maps to rule.<id> in i18n.
const RULES = [
  ['das', /chen$/, 'chen'],
  ['das', /lein$/, 'lein'],
  ['die', /ung$/, 'ung'],
  ['die', /(heit|keit)$/, 'heit'],
  ['die', /schaft$/, 'schaft'],
  ['die', /tät$/, 'taet'],
  ['die', /ion$/, 'ion'],
  ['die', /(enz|anz)$/, 'enz'],
  ['die', /ik$/, 'ik'],
  ['der', /ling$/, 'ling'],
  ['der', /ismus$/, 'ismus'],
  ['das', /tum$/, 'tum'],
  ['das', /um$/, 'um'],
  ['das', /ment$/, 'ment'],
  ['die', /ie$/, 'ie'],
  ['die', /ei$/, 'ei'],
  ['die', /ur$/, 'ur'],
  ['der', /ist$/, 'ist'],
  ['der', /(eur|ör)$/, 'eur'],
  ['der', /(ig|ich)$/, 'ig'],
  ['der', /or$/, 'or'],
  ['der', /(ant|ent)$/, 'ant'],
  ['die', /e$/, 'e'],
];

export const RULE_IDS = [...RULES.map((r) => r[2]), 'ge', 'er'];

export function articleRule(lemma) {
  const l = lemma.toLowerCase();
  for (const [article, re, id] of RULES) if (re.test(l)) return { article, id };
  if (/^Ge[^aeiouäöü]/.test(lemma)) return { article: 'das', id: 'ge' };
  if (/er$/.test(l)) return { article: 'der', id: 'er' };
  return null;
}

// Compounds take the article of their last part: Haustür → die Tür.
export function compoundBase(lemma, words) {
  const l = lemma.toLowerCase();
  let best = null;
  for (const w of words) {
    if (w.deleted || w.pos !== 'noun' || !w.article || w.lemma.length < 3) continue;
    const b = w.lemma.toLowerCase();
    if (b === l || !l.endsWith(b)) continue;
    if (!best || b.length > best.lemma.length) best = w;
  }
  return best;
}

const norm = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const loose = (s) =>
  norm(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// result: exact | near | wrong; why: case | noArticle | wrongArticle | oneLetter
export function checkSpelling(input, w) {
  const expected = displayWord(w);
  const a = norm(input);
  if (a === norm(expected)) return { result: 'exact', expected };
  if (loose(a) === loose(expected)) return { result: 'near', expected, why: 'case' };
  if (w.pos === 'noun' && w.article) {
    const m = a.match(/^(der|die|das)\s+(.+)$/i);
    if (m && loose(m[2]) === loose(w.lemma)) return { result: 'wrong', expected, why: 'wrongArticle' };
    if (loose(a) === loose(w.lemma)) return { result: 'near', expected, why: 'noArticle' };
  }
  if (expected.length >= 6 && levenshtein(loose(a), loose(expected)) === 1) {
    return { result: 'near', expected, why: 'oneLetter' };
  }
  return { result: 'wrong', expected };
}
