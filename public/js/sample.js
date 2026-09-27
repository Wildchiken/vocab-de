// A small A1 starter set so a new user can try the app before importing their own list.
export const SAMPLE = [
  ['der', 'Tisch', 'Tische', 'noun', '', '桌子', 'table'],
  ['die', 'Tür', 'Türen', 'noun', '', '门', 'door'],
  ['das', 'Fenster', 'Fenster', 'noun', '', '窗户', 'window'],
  ['der', 'Stuhl', 'Stühle', 'noun', '', '椅子', 'chair'],
  ['das', 'Buch', 'Bücher', 'noun', '', '书', 'book'],
  ['die', 'Zeitung', 'Zeitungen', 'noun', '', '报纸', 'newspaper'],
  ['das', 'Mädchen', 'Mädchen', 'noun', '', '女孩', 'girl'],
  ['der', 'Bahnhof', 'Bahnhöfe', 'noun', '', '火车站', 'train station'],
  ['die', 'Wohnung', 'Wohnungen', 'noun', '', '公寓', 'apartment'],
  ['das', 'Kind', 'Kinder', 'noun', '', '孩子', 'child'],
  ['die', 'Stadt', 'Städte', 'noun', '', '城市', 'city'],
  ['der', 'Freund', 'Freunde', 'noun', '', '朋友', 'friend'],
  ['die', 'Straße', 'Straßen', 'noun', '', '街道', 'street'],
  ['das', 'Auto', 'Autos', 'noun', '', '汽车', 'car'],
  ['der', 'Apfel', 'Äpfel', 'noun', '', '苹果', 'apple'],
  ['das', 'Wasser', '—', 'noun', '', '水', 'water'],
  ['', 'gehen', '', 'verb', 'ging, ist gegangen', '走；去', 'to go, to walk'],
  ['', 'sprechen', '', 'verb', 'sprach, hat gesprochen', '说话', 'to speak'],
  ['', 'schön', '', 'adj', '', '美丽的；好的', 'beautiful, nice'],
  ['', 'heute', '', 'adv', '', '今天', 'today'],
];

export function sampleWords(lang) {
  return SAMPLE.map(([article, lemma, plural, pos, forms, zh, en]) => ({
    article,
    lemma,
    plural,
    pos,
    forms,
    zh: lang === 'zh' ? zh : en,
  }));
}
