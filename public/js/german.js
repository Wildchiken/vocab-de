// 德语词条解析、冠词规律提示、拼写比对

export const ARTICLES = ['der', 'die', 'das'];
export const NO_PLURAL = '—';

const CJK = /[㐀-鿿豈-﫿]/;
const PLURAL_SPEC = /^(?:-|–|—|-?[¨"]-?[a-zäöüß]*|-[a-zäöüß]+)$/;
const NO_PLURAL_SPEC = /^(?:nur\s*Sg\.?|o\.\s*Pl\.?|ohne\s*Pl\.?|kein\s*Pl\.?|Sg\.?|nur\s*Singular)/i;

const UMLAUT = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };

/** Apfel → Äpfel, Haus → Häus（后面再接 -er）, Stadt → Städt */
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

/** 由词表里常见的复数标记（-e, ¨-er, -, -n …）推出完整复数 */
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

/**
 * 解析一行词条。支持：
 *   der Tisch, -e 桌子
 *   der Tisch, -e<TAB>桌子
 *   die Mutter, ¨ – 母亲
 *   der Abend, -e  Am Abend sehe ich fern.   （Goethe 词表格式，后半句当例句）
 *   gehen, ging, ist gegangen 走
 *   Tisch                                     （只有词，释义之后再补）
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
    if (i > 0) {
      de = line.slice(0, i);
      zh = line.slice(i).trim();
    } else if (i === 0) {
      return null;
    }
  }
  de = de.trim();
  while (/\s[-=:：—–|/]$/.test(de) && !/,\s*[-–—]$/.test(de)) de = de.slice(0, -1).trim();
  de = de.replace(/[：:=|]$/, '').trim();

  const item = { raw: raw.trim(), lemma: '', article: '', plural: '', pos: '', forms: '', zh, example: '', exampleZh: '' };

  // der Tisch (-e)
  let parenSpec = '';
  de = de.replace(/\s*\(([^)]*)\)\s*$/, (_, s) => {
    parenSpec = s.trim();
    return '';
  });

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
    const tail = rest.join(', ').trim();
    if (tail.split(/\s+/).length >= 3) item.example = tail;
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

/** 导入前必须补上的：中文释义；名词还要冠词 */
export function isIncomplete(item) {
  return !item.zh || (item.pos === 'noun' && !item.article);
}

export function displayWord(w) {
  return w.pos === 'noun' && w.article ? `${w.article} ${w.lemma}` : w.lemma;
}

export function pluralText(w) {
  if (w.pos !== 'noun' || !w.plural) return '';
  if (w.plural === NO_PLURAL) return '无复数';
  return `die ${w.plural}`;
}

// 冠词规律
const RULES = [
  ['das', /chen$/, '-chen 结尾（指小词）一律 das'],
  ['das', /lein$/, '-lein 结尾（指小词）一律 das'],
  ['die', /ung$/, '-ung 结尾一律 die'],
  ['die', /(heit|keit)$/, '-heit / -keit 结尾一律 die'],
  ['die', /schaft$/, '-schaft 结尾一律 die'],
  ['die', /(tät)$/, '-tät 结尾一律 die'],
  ['die', /ion$/, '-ion 结尾几乎都是 die'],
  ['die', /(enz|anz)$/, '-enz / -anz 结尾都是 die'],
  ['die', /ik$/, '-ik 结尾几乎都是 die'],
  ['der', /ling$/, '-ling 结尾一律 der'],
  ['der', /ismus$/, '-ismus 结尾一律 der'],
  ['das', /tum$/, '-tum 结尾多为 das（der Irrtum、der Reichtum 例外）'],
  ['das', /um$/, '-um 结尾多为 das'],
  ['das', /ment$/, '-ment 结尾多为 das'],
  ['die', /ie$/, '-ie 结尾多为 die'],
  ['die', /ei$/, '-ei 结尾多为 die'],
  ['die', /ur$/, '-ur 结尾多为 die'],
  ['der', /(ist)$/, '-ist 结尾（人）是 der'],
  ['der', /(eur|ör)$/, '-eur 结尾（人）是 der'],
  ['der', /(ig|ich)$/, '-ig / -ich 结尾多为 der'],
  ['der', /or$/, '-or 结尾多为 der'],
  ['der', /(ant|ent)$/, '-ant / -ent 结尾（人）多为 der'],
  ['die', /e$/, '-e 结尾约九成是 die'],
];

export function articleRule(lemma) {
  const l = lemma.toLowerCase();
  for (const [article, re, text] of RULES) if (re.test(l)) return { article, text };
  if (/^Ge[^aeiouäöü]/.test(lemma)) return { article: 'das', text: 'Ge- 开头的集合名词多为 das' };
  if (/er$/.test(l)) return { article: 'der', text: '-er 结尾（人/工具）多为 der' };
  return null;
}

/** 复合词的冠词跟最后一个词：Haustür → die Tür */
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

// 拼写比对
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

/** result: exact | near | wrong */
export function checkSpelling(input, w) {
  const expected = displayWord(w);
  const a = norm(input);
  if (a === norm(expected)) return { result: 'exact', expected };
  if (loose(a) === loose(expected)) return { result: 'near', expected, why: '大小写或变音符号不对' };
  if (w.pos === 'noun' && w.article) {
    const m = a.match(/^(der|die|das)\s+(.+)$/i);
    if (m && loose(m[2]) === loose(w.lemma)) return { result: 'wrong', expected, why: '冠词错了' };
    if (loose(a) === loose(w.lemma)) return { result: 'near', expected, why: '漏了冠词' };
  }
  if (expected.length >= 6 && levenshtein(loose(a), loose(expected)) === 1) {
    return { result: 'near', expected, why: '差一个字母' };
  }
  return { result: 'wrong', expected };
}
