// Links to online dictionaries, opened in a new tab. The app itself sends nothing to them.
const q = encodeURIComponent;

const SITES = {
  godic: { name: '德语助手', url: (w) => `https://www.godic.net/dicts/de/${q(w)}` },
  leoZh: { name: 'LEO', url: (w) => `https://dict.leo.org/chinesisch-deutsch/${q(w)}` },
  leoEn: { name: 'LEO', url: (w) => `https://dict.leo.org/german-english/${q(w)}` },
  dictcc: { name: 'dict.cc', url: (w) => `https://www.dict.cc/?s=${q(w)}` },
  wiktionary: { name: 'Wiktionary', url: (w) => `https://de.wiktionary.org/wiki/${q(w)}` },
};

const BY_LANG = {
  zh: ['godic', 'wiktionary', 'leoZh'],
  en: ['leoEn', 'dictcc', 'wiktionary'],
};

/** What to look up for a word; sentences are not dictionary entries. */
export const lookupTerm = (w) => (w.pos === 'sentence' ? '' : String(w.lemma || '').trim());

export function dictLinks(term, lang) {
  if (!term) return [];
  return (BY_LANG[lang] || BY_LANG.en).map((id) => ({ name: SITES[id].name, href: SITES[id].url(term) }));
}
