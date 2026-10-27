import * as S from './store.js';
import { state } from './store.js';
import { sync, initSync, setToken, syncNow, wipeRemote, peek, onSyncChange, onRemoteChange, onLibraryReset } from './sync.js';
import {
  parseLine,
  isIncomplete,
  pluralText,
  articleRule,
  compoundBase,
  checkSpelling,
  displayWord,
  ARTICLES,
  NO_PLURAL,
} from './german.js';
import { dayStart, DAY, rechecking } from './fsrs.js';
import { t, fmtIvl, locale, detectLang, setLang, getLang, LANGS } from './i18n.js';
import { sampleWords } from './sample.js';
import { itemsFromFile, toCSV, TEMPLATE_HEADER, updateFor } from './importer.js';
import { speak, ttsAvailable } from './tts.js';
import { play } from './sfx.js';
import { dictLinks, lookupTerm } from './dict.js';
import { startGlass, moveTabLens } from './glass.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('navbar');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, root = $app) => root.querySelector(sel);
const $$ = (sel, root = $app) => [...root.querySelectorAll(sel)];

const POS = ['noun', 'verb', 'adj', 'adv', 'prep', 'conj', 'phrase', 'sentence', 'other'];
const posLabel = (p) => (POS.includes(p) ? t(`pos.${p}`) : '');

const ICON = {
  speak:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9.2v5.6h3.8l5 4.2V5l-5 4.2z" fill="currentColor"/><path d="M15.5 8.8a4.6 4.6 0 0 1 0 6.4M18.2 6.2a8.3 8.3 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5L4 10l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10H14a5.5 5.5 0 0 1 0 11h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.2L16.3 4.5a1.8 1.8 0 0 1 2.5 0l.7.7a1.8 1.8 0 0 1 0 2.5L8.2 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 13 21" aria-hidden="true"><path d="M11 2L2.5 10.5 11 19" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 6.9 9 4.8 4.8 0 0 0 7 18.5z" fill="currentColor"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.8C10 5.2 7 4.6 3.5 5.1v13c3.5-.5 6.5.1 8.5 1.6 2-1.5 5-2.1 8.5-1.6v-13C17 4.6 14 5.2 12 6.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.8v12.9" stroke="currentColor" stroke-width="2"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.5 1.3-4 2.3-5 .2 1.8 1 2.8 2 3.2C10.3 9 11 6 12 3z" fill="currentColor"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l.8-3.6L15.6 5.6a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L8.6 18.2z" fill="currentColor"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 12h8M17 12v3M20 12v2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.1 6.1a1.5 1.5 0 0 1-2.1 0z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.2v13.6a1 1 0 0 0 1.5.9l10.8-6.8a1 1 0 0 0 0-1.7L9 4.3a1 1 0 0 0-1.5.9z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15M9.5 6V4.5h5V6M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h7l4.5 4.5v12.5H7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6.5" width="12.5" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8 4.5h9.5A2.5 2.5 0 0 1 20 7v10" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z" fill="currentColor"/><path d="M10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5h9.5V15M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
};

const stripesIcon = '<span class="ic stripes"><i class="s-der"></i><i class="s-die"></i><i class="s-das"></i></span>';
const icon = (name, color) => `<span class="ic ${color}">${ICON[name]}</span>`;

function wordHTML(w) {
  if (w.pos === 'noun' && ARTICLES.includes(w.article)) {
    return `<span class="g g-${w.article}"><span class="art">${w.article}</span> <span class="lemma">${esc(w.lemma)}</span></span>`;
  }
  return `<span class="g"><span class="lemma">${esc(w.lemma)}</span></span>`;
}

const shortMeaning = (s) => (s || '').split(/[；;]/).slice(0, 2).join('；');
const pluralLabel = (w) => {
  const p = pluralText(w);
  return p === NO_PLURAL ? t('add.noPlural') : p;
};
// Opened from a study session, the word page leads back to it instead of to the list.
const wordLink = (w, from = '') => `#word/${encodeURIComponent(w.id)}${from ? `/${from}` : ''}`;

function toast(msg, opts = {}) {
  const { ms = 2200, action, onAction } = typeof opts === 'number' ? { ms: opts } : opts;
  const el = document.getElementById('toast');
  const hide = () => el.classList.remove('show');
  el.textContent = msg;
  el.classList.toggle('has-action', Boolean(action));
  if (action) {
    const b = document.createElement('button');
    b.textContent = action;
    b.addEventListener('click', () => {
      hide();
      onAction();
    });
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(hide, action ? Math.max(ms, 4500) : ms);
}

// In-app alert. Native confirm()/prompt() are blocked in some embedded browsers and return
// "cancel" immediately, which made actions silently do nothing.
// Resolves to true or false, or to 2 when the optional `alt` button is chosen. With `options`
// ([{ value, label, sub, disabled }]) it is a list to pick from instead: it resolves to the
// value picked, or null.
function dialog({ message, sub = '', confirm: okLabel = t('ok'), destructive = false, input = null, alt = null, options = null, current = null }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const el = document.createElement('div');
    el.className = 'dialog-backdrop';
    el.innerHTML = `<div class="dialog glass ${options ? 'picker' : ''}" role="${options ? 'dialog' : 'alertdialog'}" aria-modal="true" aria-labelledby="dlgMsg">
      <p id="dlgMsg">${esc(message)}</p>
      ${sub ? `<p class="dialog-sub">${esc(sub)}</p>` : ''}
      ${input ? `<input class="dialog-input" placeholder="${esc(input.placeholder || '')}" autocomplete="off">` : ''}
      ${
        options
          ? `<div class="dialog-options">${options
              .map(
                (o, i) => `<button type="button" data-i="${i}" class="${o.value === current ? 'on' : ''}" ${o.disabled ? 'disabled' : ''}>
                  <span class="opt-main"><b>${esc(o.label)}</b>${o.sub ? `<span>${esc(o.sub)}</span>` : ''}</span>${o.disabled ? '' : `<kbd>${i + 1}</kbd>`}
                </button>`,
              )
              .join('')}</div>`
          : ''
      }
      <div class="dialog-buttons ${options ? 'one' : alt ? 'three' : ''}">
        <button type="button" data-ok="0">${t('cancel')}</button>
        ${alt && !options ? `<button type="button" data-ok="2">${esc(alt)}</button>` : ''}
        ${options ? '' : `<button type="button" data-ok="1" class="${destructive ? 'destructive' : 'primary'}">${esc(okLabel)}</button>`}
      </div>
    </div>`;
    document.body.append(el);
    const field = el.querySelector('.dialog-input');
    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      prev?.focus?.();
      resolve(value);
    };
    const close = (ok) => finish(options ? null : input ? (ok ? field.value : null) : ok);
    const pick = (i) => {
      const o = options?.[i];
      if (o && !o.disabled) finish(o.value);
    };
    const currentIndex = options ? options.findIndex((o) => o.value === current && !o.disabled) : -1;
    // Capture phase, so study shortcuts don't fire while the dialog is open.
    const onKey = (e) => {
      if (e.key === 'Tab') {
        // keep focus inside the dialog
        const items = [...el.querySelectorAll('input, button:not(:disabled)')];
        const i = items.indexOf(document.activeElement);
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      } else if (e.key === 'Escape') close(false);
      else if (options && /^[1-9]$/.test(e.key)) pick(+e.key - 1);
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') options ? pick(currentIndex) : close(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b?.dataset.i) pick(+b.dataset.i);
      else if (b) close(b.dataset.ok === '2' ? 2 : b.dataset.ok === '1');
      else if (e.target === el) close(false);
    });
    const option = el.querySelector('.dialog-options .on:not(:disabled)') || el.querySelector('.dialog-options button:not(:disabled)');
    (field || option || el.querySelector('[data-ok="1"]') || el.querySelector('[data-ok="0"]')).focus();
  });
}

const local = {
  get(k, d) {
    try {
      const v = localStorage.getItem('vocab-de:' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('vocab-de:' + k, JSON.stringify(v));
    } catch {}
  },
};

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

function exportWordList() {
  const rows = [[...TEMPLATE_HEADER, 'status']];
  for (const w of S.liveWords()) {
    rows.push([w.article, w.lemma, w.plural, w.pos, w.forms, w.zh, w.example, w.exampleZh, w.notes, (w.tags || []).join(';'), S.wordStatus(w)]);
  }
  download(`vocab-de-${stamp()}.csv`, toCSV(rows), 'text/csv');
}

// A filled-in example of every column, in the interface language.
function downloadTemplate() {
  const en = getLang() === 'en';
  const lesson = en ? 'Lesson 1' : '第1课';
  const rows = [
    TEMPLATE_HEADER,
    ['der', 'Tisch', 'Tische', 'noun', '', en ? 'table' : '桌子', 'Der Tisch ist neu.', en ? 'The table is new.' : '这张桌子是新的。', '', lesson],
    ['die', 'Stadt', '¨-e', 'noun', '', en ? 'city' : '城市', '', '', en ? 'die Hauptstadt: the capital' : 'die Hauptstadt 首都', lesson],
    ['das', 'Wasser', '—', 'noun', '', en ? 'water' : '水', '', '', '', lesson],
    ['', 'gehen', '', 'verb', 'ging, ist gegangen', en ? 'to go' : '走；去', 'Ich gehe nach Hause.', en ? 'I am going home.' : '我回家。', en ? 'perfect with sein' : '完成时用 sein', lesson],
    ['', 'auf jeden Fall', '', 'phrase', '', en ? 'in any case' : '无论如何', '', '', '', lesson],
    ['', 'Wie geht es dir?', '', 'sentence', '', en ? 'How are you?' : '你好吗？', '', '', '', lesson],
  ];
  download(en ? 'vocab-de-template.csv' : 'vocab-de-模板.csv', toCSV(rows), 'text/csv');
}

// A file chosen in Settings is read on the add screen, where it can be checked first.
let pendingFile = null;

async function exportBackup() {
  download(`vocab-de-${stamp()}.json`, S.backupText(), 'application/json');
  await S.markBackedUp();
}

function relTime(ts) {
  if (!ts) return t('rel.never');
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return t('rel.now');
  if (s < 3600) return t('rel.min', { n: Math.round(s / 60) });
  if (s < 86400) return t('rel.hour', { n: Math.round(s / 3600) });
  return new Date(ts).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dueText(c) {
  if (!c || c.state === 'new') return t('due.new');
  const now = Date.now();
  if (rechecking(c, now)) return t('due.again');
  const ms = c.due - now;
  if (ms <= 0) return t('due.now');
  if (c.state !== 'review') return t('due.in', { t: fmtIvl(ms) });
  const days = Math.round((dayStart(c.due) - dayStart(now)) / DAY);
  return days <= 1 ? t('due.tomorrow') : t('due.days', { n: days });
}

function row({ title, sub = '', detail = '', href, icon: ic = '', cls = '', attrs = '', chevron = Boolean(href) }) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="row ${ic ? 'has-icon' : ''} ${cls}" ${href ? `href="${href}"` : ''} ${attrs}>
    ${ic}
    <div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
    ${detail !== '' ? `<div class="row-detail">${detail}</div>` : ''}
    ${chevron ? ICON.chev : ''}
  </${tag}>`;
}

// Sizes that depend on data are written as data-* and applied through CSSOM, which strict
// Content Security Policies allow (inline style="" attributes are blocked).
function applySizes(root = $app) {
  for (const el of root.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
  for (const el of root.querySelectorAll('[data-h]')) el.style.height = `${el.dataset.h}%`;
  for (const el of root.querySelectorAll('[data-flex]')) el.style.flex = el.dataset.flex;
}
new MutationObserver(() => applySizes()).observe($app, { childList: true, subtree: true });

const largeTitle = (title, kicker = '') =>
  `<header class="large-title">${kicker ? `<span class="kicker">${kicker}</span>` : ''}<h1>${title}</h1></header>`;

function applyLang() {
  setLang(detectLang(local.get('lang', 'auto')));
  document.documentElement.lang = locale();
  document.title = t('app.name');
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t('app.name'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
}

// The small nav title appears once the large title has scrolled away.
function setNav({ title = '', back = null, extra = '', large = true } = {}) {
  document.getElementById('navTitle').textContent = title;
  document.getElementById('navLeft').innerHTML = back
    ? `<a class="nav-back glass" href="${back.href}" aria-label="${esc(t('back', { label: back.label }))}">${ICON.back}<span>${esc(back.label)}</span></a>`
    : '';
  document.getElementById('navExtra').innerHTML = extra;
  $nav.dataset.large = large ? '1' : '';
  $nav.classList.toggle('show-title', !large);
}
const $tabbar = document.querySelector('.tabbar');
const $capsule = document.querySelector('.tab-capsule');

// How strongly the scroll edges blur what is under the bars: nothing while no content is under
// them, all of it once 32px are, eased in between (as Liquid Glass's scroll edges do). Written on
// the bars themselves, not the body, so a scroll restyles only them.
const edgeStrength = (px) => {
  const t = Math.min(1, Math.max(0, px / 32));
  return String(+(t * t * (3 - 2 * t)).toFixed(3));
};
function setEdges(y = window.scrollY) {
  const end = document.documentElement.scrollHeight - window.innerHeight;
  for (const [el, value] of [[$nav, edgeStrength(y)], [$tabbar, edgeStrength(end - y)]]) {
    if (el.style.getPropertyValue('--edge') !== value) el.style.setProperty('--edge', value);
  }
}

let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  // collapse the tab bar while scrolling down, expand on the way back up
  if (y < 40 || y < lastY - 6) document.body.classList.remove('tab-min');
  else if (y > lastY + 6 && y > 80) document.body.classList.add('tab-min');
  if (Math.abs(y - lastY) > 6 || y < 40) lastY = y;
  setEdges(y);
  const lt = document.querySelector('.large-title h1');
  const showTitle = !$nav.dataset.large || (lt && lt.getBoundingClientRect().bottom < $nav.getBoundingClientRect().bottom);
  $nav.classList.toggle('show-title', Boolean(showTitle));
}
window.addEventListener('scroll', onScroll, { passive: true });
// The page can grow or shrink without scrolling (a filter, a section opening).
new ResizeObserver(() => setEdges()).observe($app);
window.addEventListener('resize', () => setEdges());

startGlass();

$capsule.addEventListener('click', (e) => {
  if (!document.body.classList.contains('tab-min') || matchMedia('(min-width: 1000px)').matches) return;
  e.preventDefault();
  document.body.classList.remove('tab-min');
});

// Safari has no field-sizing yet.
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
document.addEventListener('input', (e) => e.target.matches?.('.field textarea') && autoGrow(e.target));

// The second tap of a double-tap lands on whatever appeared under the first one: the rating
// buttons where "show answer" was, the next card's button where a rating was. A click shortly
// after another and close to it is such a tap and is ignored; keyboard clicks never are.
function doubleTap(ms = 400, radius = 40) {
  let last = null;
  return {
    accept(e) {
      if (!e || !e.detail || e.clientX === undefined) return true;
      const now = Date.now();
      const repeat = last && now - last.t < ms && Math.hypot(e.clientX - last.x, e.clientY - last.y) < radius;
      last = { x: e.clientX, y: e.clientY, t: now };
      return !repeat;
    },
  };
}

let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (!keyHandler || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  keyHandler(e);
});

let cleanup = null;
let current = '';
// #add?text=… can prefill the add screen from a bookmarklet or a shortcut.
let hashParams = new URLSearchParams();
const routes = {
  home: homeView,
  study: () => sessionView({ from: 'study' }),
  // practice on the nouns learned so far, asked for their article
  article: () => {
    practiceIds = S.practicePool(20, S.hasArticle).map((w) => w.id);
    practiceBack = '#home';
    return sessionView({ from: 'article', forceMode: 'article' });
  },
  words: wordsView,
  add: addView,
  word: editView,
  practice: () => sessionView({ from: 'practice' }),
  formats: formatsView,
  stats: statsView,
  settings: settingsView,
};
const TAB_OF = { word: 'words' };

let refreshView = null;

function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [name, ...args] = path.split('/');
  hashParams = new URLSearchParams(query);
  cleanup?.();
  cleanup = null;
  refreshView = null;
  keyHandler = null;
  current = routes[name] ? name : 'home';
  document.body.dataset.view = current;
  document.body.classList.toggle('in-session', current === 'word' && STUDY_VIEWS.includes(args[1]));
  const tab = TAB_OF[current] || current;
  for (const a of document.querySelectorAll('.tabbar a')) {
    a.classList.toggle('active', a.getAttribute('href') === `#${tab}`);
  }
  // The add button sits outside the capsule; with nothing active inside it, a collapsed
  // capsule would be an empty bubble.
  document.body.classList.toggle('tab-outside', !document.querySelector('.tab-capsule a.active'));
  moveTabLens();
  window.scrollTo(0, 0);
  lastY = 0;
  document.body.classList.remove('tab-min');
  cleanup = routes[current](...args.map(decodeURIComponent)) || null;
  onScroll();
  if (!STUDY_VIEWS.includes(current)) {
    $app.classList.remove('enter');
    void $app.offsetWidth;
    $app.classList.add('enter');
  }
  applyUpdateIfIdle();
}

// A new release is applied by reloading, but never in the middle of a session or while typing.
const STUDY_VIEWS = ['study', 'article', 'practice'];
const SAFE_TO_RELOAD = ['home', 'words', 'stats', 'settings', 'formats'];
let updateReady = false;
function applyUpdateIfIdle() {
  if (!updateReady || !SAFE_TO_RELOAD.includes(current)) return;
  try {
    sessionStorage.setItem('vocab-de:updated', '1');
  } catch {}
  location.reload();
}

const syncError = () => t(`sync.err.${sync.error || 'server'}`);

function renderSync() {
  const btn = document.getElementById('syncBtn');
  const label = t(`sync.${sync.status}`);
  btn.dataset.status = sync.status;
  btn.hidden = sync.status === 'off';
  btn.setAttribute('aria-label', label);
  btn.title = sync.status === 'error' ? syncError() : `${label} · ${t('sync.last', { time: relTime(sync.lastSync) })}`;
  const info = document.getElementById('syncInfo');
  if (info) info.innerHTML = syncStatusHTML();
}
document.getElementById('syncBtn').addEventListener('click', async () => {
  if (sync.status === 'off') {
    location.hash = '#settings';
    return;
  }
  await syncNow();
  toast(sync.status === 'error' ? syncError() : sync.status === 'offline' ? t('sync.offlineToast') : t('sync.idle'));
});

let pendingAdd = '';

// "Seen 120 / 600 · finished on Oct 24" for a word list (tag).
function listProgressText(r) {
  const parts = [t('progress.seen', { seen: r.seen, total: r.total })];
  if (r.days === 0) parts.push(t('progress.today'));
  else if (r.days > 0) {
    parts.push(t('progress.eta', { date: new Date(r.date).toLocaleDateString(locale(), { month: 'long', day: 'numeric' }) }));
  } else if (r.seen === r.total) parts.push(t('progress.done'));
  return parts.join(' · ');
}

function todayKicker() {
  return new Date().toLocaleDateString(locale(), { month: 'long', day: 'numeric', weekday: 'long' });
}

function homeView() {
  setNav({ title: t('tab.home') });
  const words = S.liveWords();
  if (!words.length) {
    $app.innerHTML = `
      ${largeTitle(t('tab.home'), todayKicker())}
      <section class="section welcome">
        <div class="summary done">
          <div class="done-circle tint">${ICON.book}</div>
          <h2>${t('home.emptyTitle')}</h2>
          <p class="secondary t-sub">${t('home.emptyBody')}</p>
        </div>
      </section>
      <section class="section">
        <div class="section-header">${t('home.formats')}</div>
        <div class="list"><pre class="sample" lang="de">${esc(t('home.sample'))}</pre></div>
        <div class="section-footer">${t('home.formatsFoot')}</div>
      </section>
      <section class="section home-actions">
        <a class="btn" href="#add">${t('home.import')}</a>
        <button class="btn tinted" id="trySample">${t('home.trySample')}</button>
      </section>
      ${
        sync.status === 'off'
          ? `<section class="section"><div class="list">${row({ title: t('home.syncPromo'), icon: icon('cloud', 'blue'), href: '#settings' })}</div></section>`
          : ''
      }`;
    $('#trySample').addEventListener('click', async () => {
      const base = Date.now();
      const words = sampleWords(getLang()).map((item, i) => {
        const w = S.makeWord({ ...item, tags: [t('home.sampleTag')], batch: base });
        w.createdAt = base + i;
        return w;
      });
      await S.addWords(words);
      route();
      toast(t('home.sampleAdded', { n: words.length }), 5000);
    });
    return;
  }

  const c = S.todayCounts();
  const st = S.stats();
  const reviewTotal = c.due.meaning;
  const learned = S.practicePool(1).length > 0;
  const mode = getMode();

  // After a break: part of the reviews move to the next days and new words wait.
  const backlogHTML = c.overflow
    ? `<p class="secondary t-sub backlog">${t(c.paused ? 'home.backlogPaused' : 'home.backlog', { n: c.overflow })}</p>
       ${c.paused && c.unseen ? `<button class="btn tinted small" id="newAnyway">${t('home.newAnyway')}</button>` : ''}`
    : '';
  $app.innerHTML = `
    ${largeTitle(t('tab.home'), todayKicker())}
    <section class="section">
      ${
        c.total
          ? `<div class="summary">
              <div class="summary-nums">
                <div><div class="summary-label">${t('home.due')}</div><div class="summary-num c-tint">${reviewTotal}</div></div>
                <div><div class="summary-label">${t('home.new')}</div><div class="summary-num c-blue">${c.newLeft.meaning}</div></div>
              </div>
              ${reviewTotal ? '' : `<p class="secondary t-sub">${t('home.nothingDue')}</p>`}
              ${backlogHTML}
              <a class="btn" href="#study">${t('home.start')}<kbd>↵</kbd></a>
            </div>`
          : `<div class="summary done">
              <div class="done-circle">${ICON.check}</div>
              <h2>${t('home.doneTitle')}</h2>
              <p class="secondary t-sub">${t('home.tomorrow', { n: st.forecast[1] })}</p>
              ${backlogHTML}
              ${c.unseen ? `<button class="btn tinted more-new" id="moreNew">${t('home.moreNew', { n: Math.min(10, c.unseen) })}</button>` : ''}
            </div>`
      }
    </section>

    ${
      backupDue(words)
        ? `<section class="section"><div class="list">${row({
            title: t('home.backup'),
            sub: t('home.backupSub', { time: relTime(state.lastBackup) }),
            icon: icon('up', 'blue'),
            cls: 'action',
            attrs: 'id="backupNow" role="button" tabindex="0"',
          })}</div></section>`
        : ''
    }

    <section class="section">
      <div class="list">
        <label class="row has-icon field">${icon('target', 'indigo')}<span class="grow">${t('home.mode')}</span>
          <select id="studyMode">${MODES.map((m) => `<option value="${m}" ${m === mode ? 'selected' : ''}>${t(`mode.${m}`)}</option>`).join('')}</select>${ICON.chev}
        </label>
        <label class="row has-icon wrap" id="askArticleRow" ${mode === 'recognize' ? '' : 'hidden'}>${stripesIcon}<div class="row-main"><div class="row-title">${t('home.askArticle')}</div><div class="row-sub">${t('home.askArticleSub')}</div></div><input type="checkbox" class="switch" id="askArticle" ${state.settings.askArticle ? 'checked' : ''}></label>
      </div>
      <div class="section-footer" id="modeFoot">${esc(t(`mode.desc.${mode}`))} ${esc(t('mode.note'))}</div>
    </section>

    <section class="section">
      <div class="list">
        <button class="row action has-icon wrap" id="freePractice" ${learned ? '' : 'disabled'}>${icon('practice', 'blue')}<div class="row-main"><div class="row-title">${t('home.practice')}</div><div class="row-sub">${learned ? t('home.practiceSub') : t('home.practiceLocked')}</div></div>${learned ? ICON.chev : ''}</button>
      </div>
    </section>

    <section class="section">
      <div class="section-header">${t('home.quick')}</div>
      <form class="list quick-add" id="quickAdd">
        <div class="row">
          <input class="bare" id="qa" placeholder="${esc(t('home.quickPh'))}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de" enterkeyhint="done">
          <button class="btn small">${t('home.add')}</button>
        </div>
      </form>
    </section>

    <section class="section">
      <div class="section-header">${t('home.overview')}</div>
      <div class="list">
        ${row({ title: t('home.streak'), icon: icon('flame', 'orange'), detail: t('n.days', { n: st.streak }) })}
        ${row({ title: t('home.reviewed'), icon: icon('check', 'green'), detail: t('n.answers', { n: st.todayReviews }) })}
        ${row({ title: t('home.mastered'), icon: icon('target', 'indigo'), detail: `${st.byStatus.mature} / ${st.total}`, href: '#stats' })}
      </div>
    </section>`;

  $('#studyMode').addEventListener('change', (e) => {
    local.set('mode', e.target.value);
    $('#modeFoot').textContent = `${t(`mode.desc.${e.target.value}`)} ${t('mode.note')}`;
    // asking the article first is a way of recognizing, so it sits with that mode
    $('#askArticleRow').hidden = e.target.value !== 'recognize';
  });
  $('#askArticle').addEventListener('change', (e) => S.saveSettings({ askArticle: e.target.checked }));
  // Words learned so far, picked at random with the ones that gave trouble more likely.
  $('#freePractice').addEventListener('click', () => startPractice({ back: '#home' }));
  $('#moreNew')?.addEventListener('click', async () => {
    await S.addExtraNew(Math.min(10, c.unseen));
    location.hash = '#study';
  });
  $('#newAnyway')?.addEventListener('click', async () => {
    await S.addExtraNew(0, Date.now(), true);
    route();
  });
  $('#backupNow')?.addEventListener('click', async () => {
    await exportBackup();
    toast(t('home.backedUp'), 3500);
    route();
  });
  // Complete entries are saved right here; anything missing goes to the import screen.
  $('#quickAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#qa').value.trim();
    const item = v && parseLine(v);
    if (!item) return;
    if (S.findDuplicate(item.lemma, item.article)) {
      toast(t('home.exists', { w: displayWord(item) }));
      return;
    }
    if (isIncomplete(item)) {
      pendingAdd = v;
      location.hash = '#add';
      return;
    }
    const w = S.makeWord(item);
    await S.addWords([w]);
    route();
    $('#qa')?.focus();
    toast(t('home.added', { w: displayWord(w) }), {
      action: t('study.undo'),
      onAction: async () => {
        await S.deleteWord(w);
        if (current === 'home') route();
      },
    });
  });
  keyHandler = (e) => {
    if (e.key === 'Enter' && c.total) location.hash = '#study';
  };
}

// Without sync the only copy lives in this browser, which may clear it; nudge now and then.
function backupDue(words) {
  if (sync.status !== 'off' || words.length < 30) return false;
  const since = state.lastBackup || Math.min(...words.map((w) => w.createdAt));
  return Date.now() - since > 14 * DAY;
}

// Study modes. Every mode asks about the same word and updates the same schedule; only the
// question differs. A word seen for the first time is always a plain card, since there is
// nothing to recall yet.
const MODES = ['recognize', 'recall', 'choice', 'listen', 'spell', 'article'];
const MODE_CLASS = { recognize: 'meaning', recall: 'meaning', choice: 'meaning', listen: 'meaning', spell: 'spell', article: 'article' };
const getMode = () => {
  const m = local.get('mode', 'recognize');
  return MODES.includes(m) ? m : 'recognize';
};

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// What the last finished session left behind, so coming back from a word's edit page shows it again.
let lastSummary = null;
// Free practice: the words to go over, the mode they are asked in, where "back" leads, and
// the words as they were picked (null for a random draw), so they can be gone over again in
// another mode.
let practiceIds = [];
let practiceMode = null;
let practiceBack = '#home';
let practicePicked = null;

// Article practice is about nouns; every other mode takes any word.
const fitsMode = (mode) => (w) => mode !== 'article' || S.hasArticle(w);

/**
 * Free practice never changes the schedule, so its mode is chosen each time it starts, apart
 * from the study mode: the same words can be gone over by sound, then by spelling. `ids` are
 * the words picked; without them, learned words are drawn at random for the chosen mode.
 */
async function startPractice({ ids = null, back }) {
  const picked = ids && ids.map((id) => state.words.get(id)).filter((w) => w && !w.deleted);
  const pool = picked || S.practicePool(Infinity);
  if (!pool.length) return toast(t('practice.empty'), 3500);
  const nouns = pool.filter(S.hasArticle).length;
  const meanings = pool.some((w) => w.zh);
  const why = (m) =>
    m === 'listen' && !ttsAvailable()
      ? 'mode.na.listen'
      : m === 'article' && !nouns
        ? 'mode.na.article'
        : ['recall', 'choice', 'spell'].includes(m) && !meanings
          ? 'mode.na.meaning'
          : '';
  const mode = await dialog({
    message: picked ? t('practice.title', { n: picked.length }) : t('home.practice'),
    sub: picked ? t('practice.foot') : t('home.practiceSub'),
    options: MODES.map((m) => {
      const na = why(m);
      // when only some of the words picked are nouns, say how many article practice takes
      const part = m === 'article' && picked && nouns && nouns < picked.length ? ` · ${t('mode.nouns', { n: nouns })}` : '';
      return { value: m, label: t(`mode.${m}`), sub: na ? t(na) : t(`mode.short.${m}`) + part, disabled: Boolean(na) };
    }),
    current: local.get('practiceMode', getMode()),
  });
  if (!mode) return;
  local.set('practiceMode', mode);
  practiceIds = (picked ? picked.filter(fitsMode(mode)) : S.practicePool(20, fitsMode(mode))).map((w) => w.id);
  practiceMode = mode;
  practiceBack = back;
  practicePicked = ids;
  if (location.hash === '#practice') route();
  else location.hash = '#practice';
}

/**
 * A study session. `from` is the route it runs under: 'study' (today's reviews, which change
 * the schedule), 'practice' (the words in practiceIds, which never do) or 'article' (practice
 * on nouns, asked for their article).
 */
function sessionView({ from, forceMode = null }) {
  const practice = from !== 'study';
  const chosen = forceMode || (practice && practiceMode) || getMode();
  const queue = practice ? shuffle(practiceIds.map((id) => state.words.get(id)).filter((w) => w && !w.deleted && fitsMode(chosen)(w))) : [];
  if (practice && !queue.length) {
    toast(t(from === 'article' ? 'drill.empty' : 'practice.empty'), 3500);
    location.hash = practiceBack;
    return;
  }
  const total = queue.length;
  const session = { types: S.CARD_TYPES, sinceNew: 0, lastWordId: null, done: 0, again: 0, undo: null };
  let known = 0;
  const missed = new Map(); // words not known at first sight in this session
  const guard = doubleTap();
  let rating = false;
  let alive = true;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const sound = (name) => state.settings.sound && play(name);
  // After a sound effect, let it finish before the word is read out.
  const sayAfter = (text, delay) => state.settings.autoSpeak && later(() => speak(text), delay);
  // Study buttons ignore the second tap of a double-tap (see doubleTap).
  const tap =
    (fn) =>
    (e, ...rest) =>
      guard.accept(e) && fn(e, ...rest);

  // The bar follows answers, so it doesn't slide back when a word has to come again; the text
  // counts the words still to do today, the same number the home screen showed.
  function progress() {
    if (practice) return { text: `${known} / ${total}`, pct: Math.round((known / total) * 100) };
    const counts = S.todayCounts();
    const sum = session.done + counts.answersLeft.meaning;
    return { text: t('study.left', { n: counts.total }), pct: sum ? Math.round((session.done / sum) * 100) : 100 };
  }

  function updateProgress() {
    const { text, pct } = progress();
    const fill = $('.progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    if ($('.progress-text')) $('.progress-text').textContent = text;
  }

  function shell(inner, actions, meta = '') {
    // Each card installs its own shortcuts; drop the previous card's so a stray key can't
    // rate a word that is no longer on screen.
    keyHandler = null;
    rating = false;
    const { text, pct } = progress();
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar">
          <a href="${practice ? practiceBack : '#home'}" class="icon-btn glass" aria-label="${t('study.end')}" title="${t('study.end')}">${ICON.close}</a>
          <div class="progress" aria-label="${t('study.progress')}">
            <div class="progress-track"><div class="progress-fill" data-w="${pct}"></div></div>
            <div class="progress-text">${text}</div>
          </div>
          ${
            // practice changes nothing, so there is nothing to undo
            practice
              ? '<span></span>'
              : `<button class="icon-btn glass" id="undoBtn" aria-label="${t('study.undo')}" title="${t('study.undo')} (Z)" ${session.undo ? '' : 'disabled'}>${ICON.undo}</button>`
          }
        </div>
        <div class="card-area">
          <div class="card">
            <div class="card-meta">${meta}</div>
            ${inner}
          </div>
        </div>
        <div class="study-actions">${actions}</div>
      </div>`;
    $('#undoBtn')?.addEventListener('click', doUndo);
  }

  // Other meanings to put next to the right one: the same kind of word first.
  function distractors(w) {
    const mine = shortMeaning(w.zh);
    const pool = S.liveWords().filter((x) => x.id !== w.id && x.zh && shortMeaning(x.zh) !== mine);
    const out = [];
    for (const list of [shuffle(pool.filter((x) => x.pos === w.pos)), shuffle(pool)]) {
      for (const x of list) {
        if (out.length < 3 && !out.some((o) => shortMeaning(o.zh) === shortMeaning(x.zh))) out.push(x);
      }
    }
    return out.length === 3 ? out : null;
  }

  // The mode a word is asked in. A mode that cannot work for this word (no meaning to
  // type, no voice, not a noun) falls back to the plain card. In practice the mode was picked
  // for these very words, so it applies to words not studied yet as well.
  function modeFor(w) {
    if (!practice && S.getCard(w, 'meaning').state === 'new') return 'recognize';
    switch (chosen) {
      case 'recall':
      case 'spell':
        return w.zh ? chosen : 'recognize';
      case 'choice':
        return w.zh && distractors(w) ? 'choice' : 'recognize';
      case 'listen':
        return ttsAvailable() ? 'listen' : 'recognize';
      case 'article':
        return S.hasArticle(w) ? 'article' : 'recognize';
      default:
        return 'recognize';
    }
  }

  function next() {
    if (!alive) return;
    timers.forEach(clearTimeout);
    timers = [];
    const item = practice ? (queue[0] ? { w: queue[0] } : null) : S.pickNext(session);
    if (!item) return finish();
    session.lastWordId = item.w.id;
    show(item.w);
  }

  function show(w) {
    const cards = { recognize: recognizeCard, recall: recallCard, choice: choiceCard, listen: listenCard, spell: spellCard, article: articleCard };
    cards[modeFor(w)](w);
  }

  // Answers of the automatic modes: right and quick is "know it", right but slow "fuzzy".
  const autoGrade = (ok, ms, fast) => (!ok ? 1 : practice || ms < fast ? 3 : 2);

  async function rate(w, g, shownAt, { advance = true, article = null, how = 'recognize' } = {}) {
    if (rating) return;
    rating = true;
    if (practice) {
      if (article && !article.ok) await S.missArticle(w);
      queue.shift();
      if (g < 3) {
        session.again++;
        // bring it back a few cards later
        queue.splice(Math.min(3, queue.length), 0, w);
      } else known++;
      session.done++;
    } else {
      const snap = await S.answer(w, 'meaning', g, Date.now() - shownAt, Date.now(), article, how);
      // A word forgotten again and again deserves a note or a pause rather than more drilling.
      const lapses = state.words.get(w.id)?.cards.meaning?.lapses || 0;
      if (g === 1 && (lapses === 4 || lapses === 8)) {
        const target = wordLink(w, from);
        toast(t('study.leech', { w: displayWord(w), n: lapses }), { ms: 6000, action: t('edit'), onAction: () => (location.hash = target) });
      }
      const added = g < 3 && !missed.has(w.id);
      if (added) missed.set(w.id, g);
      session.undo = { snap, g, added, id: w.id };
      session.done++;
      if (g === 1) session.again++;
    }
    if (advance) next();
    else updateProgress();
  }

  async function doUndo() {
    if (!session.undo) return;
    const { snap, g, added, id } = session.undo;
    session.undo = null;
    const w = await S.undo(snap);
    if (added) missed.delete(id);
    if (g === 1) session.again = Math.max(0, session.again - 1);
    session.done = Math.max(0, session.done - 1);
    session.lastWordId = w.id;
    show(state.words.get(w.id));
  }

  function metaHTML(w, how) {
    const c = S.getCard(w, 'meaning');
    const tags = [`<span class="tag t-${MODE_CLASS[how]}">${t(`mode.${how}`)}</span>`];
    if (c.state === 'new') tags.push(`<span class="tag new">${t('tag.new')}</span>`);
    else if (rechecking(c, Date.now())) tags.push(`<span class="tag relearn">${t('tag.again')}</span>`);
    if (w.tags?.length) tags.push(`<span class="tag">${esc(w.tags[0])}</span>`);
    return tags.join('');
  }

  // Three grades, as in MaiMemo; free practice only asks "not yet" or "got it".
  // `grades` narrows them, e.g. no "know" after a wrong article.
  function ratingButtons(grades = [1, 2, 3]) {
    const shown = practice ? grades.filter((g) => g !== 2) : grades;
    const label = (g) => (practice ? t(g === 1 ? 'practice.again' : 'practice.know') : t(`rate.${g}`));
    const key = (g) => (practice && g === 3 ? 2 : g);
    return `<div class="rate n${shown.length}">${shown
      .map((g) => `<button class="r${g}${practice && g === 3 ? ' def' : ''}" data-g="${g}"${practice ? ` id="${g === 1 ? 'notYet' : 'gotIt'}"` : ''}><b>${label(g)}</b><kbd>${key(g)}</kbd></button>`)
      .join('')}</div>`;
  }
  // The grade a key stands for, among the grades on offer.
  const keyGrade = (k, grades) => {
    const g = practice ? { 1: 1, 2: 3 }[k] : { 1: 1, 2: 2, 3: 3 }[k];
    return g && grades.includes(g) ? g : null;
  };
  // Show the rating bar and wire it; `onRate(g)` runs when one is chosen.
  function showRating(grades, onRate) {
    $('.study-actions').innerHTML = ratingButtons(grades);
    $$('.rate button').forEach((b) => b.addEventListener('click', tap(() => onRate(+b.dataset.g))));
  }

  function articleHint(w) {
    const comp = compoundBase(w.lemma, S.liveWords());
    const rule = articleRule(w.lemma);
    let hint = '';
    if (comp) {
      const base = `<span class="g g-${comp.article}" lang="de"><span class="art">${comp.article}</span> ${esc(comp.lemma)}</span>`;
      hint = t('drill.compound', { word: base });
    } else if (rule) {
      hint = esc(t(`rule.${rule.id}`)) + (rule.article !== w.article ? ` <span class="exc">${t('drill.exception')}</span>` : '');
    }
    return { hint, exception: !comp && rule && rule.article !== w.article };
  }

  // The part of a card that shows once it is turned: forms, meaning, example, notes.
  const answerHTML = (w, { withWord = false } = {}) => {
    const extra = [posLabel(w.pos), pluralLabel(w), w.forms].filter(Boolean).map(esc).join(' · ');
    return `<div class="answer" id="answer" hidden>
      ${withWord ? `<div class="word-big${displayWord(w).length > 22 ? ' long' : ''}" id="wordBig" lang="de">${wordHTML(w)}</div>` : ''}
      ${extra ? `<div class="sub">${extra}</div>` : ''}
      <div class="zh">${esc(w.zh) || `<span class="tertiary">${t('card.noMeaning')}</span>`}</div>
      ${
        w.example
          ? `<div class="example"><button class="say-example" id="sayExample" lang="de" aria-label="${t('listen')}">${ttsAvailable() ? `${ICON.speaker} ` : ''}${esc(w.example)}</button>${w.exampleZh ? `<div class="secondary">${esc(w.exampleZh)}</div>` : ''}</div>`
          : ''
      }
      ${w.notes ? `<div class="notes">${esc(w.notes)}</div>` : ''}
      <a class="edit-link" href="${wordLink(w, from)}">${ICON.edit} ${t('edit')}</a>
    </div>`;
  };
  const wireExample = (w, isRevealed) =>
    $('#sayExample')?.addEventListener('click', (e) => {
      if (!isRevealed()) return;
      e.stopPropagation();
      speak(w.example);
    });
  const revealBtn = `<button class="btn" id="reveal">${t('card.reveal')}<kbd>${t('key.space')}</kbd></button>`;

  // ---- recognize: see the German word, rate how well it is known
  function recognizeCard(w) {
    const shownAt = Date.now();
    const isNew = S.getCard(w, 'meaning').state === 'new';
    // With the option on, a noun seen before is asked for its article first, and picking it
    // also turns the card; a noun met for the first time is shown whole.
    const askArticle = state.settings.askArticle && S.hasArticle(w) && !isNew;
    const seenHints = local.get('artHints', 0);
    if (askArticle && seenHints < 3) local.set('artHints', seenHints + 1);
    let revealed = false;
    let article = null;
    let grades = [1, 2, 3];
    const front = askArticle ? `<span class="g"><span class="lemma">${esc(w.lemma)}</span></span>` : wordHTML(w);
    let actions = revealBtn;
    if (askArticle) {
      actions = `<div class="art-buttons">${ARTICLES.map((a, i) => `<button class="art-btn b-${a}" data-a="${a}" lang="de">${a}<kbd>${i + 1}</kbd></button>`).join('')}</div>
        <button class="text-btn" id="skipArt">${t('card.skipArticle')}</button>`;
    } else if (isNew && !practice) {
      actions = `<div class="two even"><button class="btn gray" id="known">${t('card.known')}</button>${actions}</div>`;
    }
    shell(
      `<div class="card-body flash" id="flash">
        <div class="word-big${displayWord(w).length > 22 ? ' long' : ''}" id="wordBig" lang="de">${front}</div>
        ${ttsAvailable() ? `<button class="speak" id="speak" aria-label="${t('listen')}" title="${t('listen')} (R)">${ICON.speak}</button>` : ''}
        ${askArticle && seenHints < 3 ? `<div class="secondary t-sub hint-line" id="artHint">${t('card.pickArticle')}</div>` : ''}
        <div class="article-result" id="artResult" hidden></div>
        ${answerHTML(w)}
      </div>`,
      actions,
      metaHTML(w, 'recognize'),
    );
    // Before the article is picked only the bare noun is read out.
    const say = () => speak(askArticle && !revealed ? w.lemma : displayWord(w));
    $('#speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    if (state.settings.autoSpeak) say();
    wireExample(w, () => revealed);
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      $('#answer').hidden = false;
      $('#artHint')?.remove();
      showRating(grades, (g) => rate(w, g, shownAt, { article }));
    };
    // Show the article in the word and, for a wrong or skipped one, the rule that helps.
    const showArticle = (ok, line) => {
      $('#wordBig').innerHTML = wordHTML(w);
      const { hint } = articleHint(w);
      const res = $('#artResult');
      res.className = `article-result ${ok ? 'ok' : 'bad'}`;
      res.innerHTML = ok ? `<span class="art-ok">${ICON.check}</span>` : `${line}${hint ? `<div class="fb-hint">${hint}</div>` : ''}`;
      res.hidden = !res.innerHTML;
      // Knowing a German noun includes its article.
      if (!ok) grades = [1, 2];
    };
    const pick = (a) => {
      if (revealed) return;
      const ok = a === w.article;
      article = { ok };
      sound(ok ? 'right' : 'wrong');
      showArticle(ok, `<div class="art-bad">${t('card.notArticle', { a })}</div>`);
      sayAfter(displayWord(w), 250);
      reveal();
    };
    // Not remembering the article counts as a miss, so the noun turns up in article practice.
    const skip = () => {
      if (revealed) return;
      article = { ok: false };
      showArticle(false, '');
      sayAfter(displayWord(w), 0);
      reveal();
    };
    $$('.art-btn').forEach((b) => b.addEventListener('click', tap(() => pick(b.dataset.a))));
    $('#skipArt')?.addEventListener('click', tap(skip));
    $('#reveal')?.addEventListener('click', tap(reveal));
    // Already familiar: first review in about two weeks instead of the first few days.
    $('#known')?.addEventListener('click', tap(() => rate(w, 4, shownAt)));
    if (!askArticle) {
      $('#flash').addEventListener(
        'click',
        tap((e) => !e.target.closest('a') && reveal()),
      );
    }
    const ARTICLE_KEYS = { 1: 'der', 2: 'die', 3: 'das', j: 'der', k: 'die', l: 'das' };
    keyHandler = (e) => {
      if (e.key === 'r' || e.key === 'p') return say();
      const confirm = e.key === ' ' || e.key === 'Enter';
      const g = revealed ? keyGrade(e.key, grades) : null;
      if (!revealed && askArticle && ARTICLE_KEYS[e.key]) pick(ARTICLE_KEYS[e.key]);
      else if (!revealed && confirm) {
        e.preventDefault();
        askArticle ? skip() : reveal();
      } else if (g) rate(w, g, shownAt, { article });
      else if (revealed && confirm) {
        e.preventDefault();
        rate(w, grades.at(-1), shownAt, { article });
      } else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  // ---- recall: see the meaning, think of the German word, turn the card
  function recallCard(w) {
    const shownAt = Date.now();
    let revealed = false;
    const hint = posLabel(w.pos);
    shell(
      `<div class="card-body flash" id="flash">
        <div class="big-zh">${esc(shortMeaning(w.zh))}</div>
        ${hint ? `<div class="secondary t-sub hint-line">${hint}</div>` : ''}
        ${w.exampleZh ? `<div class="example secondary">${esc(w.exampleZh)}</div>` : ''}
        <div class="recall-gap"></div>
        ${answerHTML(w, { withWord: true })}
      </div>`,
      revealBtn,
      metaHTML(w, 'recall'),
    );
    wireExample(w, () => revealed);
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      $('.recall-gap').remove();
      $('#answer').hidden = false;
      // the meaning is the question here, so it is not repeated in the answer
      $('#answer .zh')?.remove();
      showRating([1, 2, 3], (g) => rate(w, g, shownAt, { how: 'recall' }));
      sayAfter(displayWord(w), 0);
    };
    $('#reveal').addEventListener('click', tap(reveal));
    $('#flash').addEventListener('click', tap((e) => !e.target.closest('a') && reveal()));
    keyHandler = (e) => {
      const confirm = e.key === ' ' || e.key === 'Enter';
      const g = revealed ? keyGrade(e.key, [1, 2, 3]) : null;
      if (!revealed && confirm) {
        e.preventDefault();
        reveal();
      } else if (g) rate(w, g, shownAt, { how: 'recall' });
      else if (revealed && confirm) {
        e.preventDefault();
        rate(w, 3, shownAt, { how: 'recall' });
      } else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  // ---- listen: only the sound, think of which word it is
  function listenCard(w) {
    const shownAt = Date.now();
    let revealed = false;
    shell(
      `<div class="card-body flash" id="flash">
        <button class="speak listen" id="speak" aria-label="${t('listen')}" title="${t('listen')} (R)">${ICON.speak}</button>
        <div class="secondary t-sub hint-line" id="listenHint">${t('card.listenHint')}</div>
        ${answerHTML(w, { withWord: true })}
      </div>`,
      revealBtn,
      metaHTML(w, 'listen'),
    );
    const say = () => speak(displayWord(w));
    $('#speak').addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    // this mode is the sound, so it plays whatever the read-aloud setting says
    later(say, 150);
    wireExample(w, () => revealed);
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      $('#listenHint').remove();
      $('#answer').hidden = false;
      showRating([1, 2, 3], (g) => rate(w, g, shownAt, { how: 'listen' }));
    };
    $('#reveal').addEventListener('click', tap(reveal));
    $('#flash').addEventListener('click', tap((e) => !e.target.closest('a, #speak') && reveal()));
    keyHandler = (e) => {
      if (e.key === 'r' || e.key === 'p') return say();
      const confirm = e.key === ' ' || e.key === 'Enter';
      const g = revealed ? keyGrade(e.key, [1, 2, 3]) : null;
      if (!revealed && confirm) {
        e.preventDefault();
        reveal();
      } else if (g) rate(w, g, shownAt, { how: 'listen' });
      else if (revealed && confirm) {
        e.preventDefault();
        rate(w, 3, shownAt, { how: 'listen' });
      } else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  // After an automatic answer: wrong ones wait for a tap so the right answer can sink in,
  // right ones move on by themselves.
  function afterAnswer({ pause, onTap }) {
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      next();
    };
    if (!pause) later(go, 800);
    $('.card').addEventListener('click', (e) => guard.accept(e) && !e.target.closest('a') && go());
    onTap?.(go);
    keyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        go();
      } else if ((e.key === 'z' || e.key === 'u') && !practice) doUndo();
    };
  }

  // ---- choice: pick the right meaning among four
  function choiceCard(w) {
    const shownAt = Date.now();
    const options = shuffle([w, ...distractors(w)]);
    let answered = false;
    shell(
      `<div class="card-body">
        <div class="word-big${displayWord(w).length > 22 ? ' long' : ''}" id="wordBig" lang="de">${wordHTML(w)}</div>
        ${ttsAvailable() ? `<button class="speak" id="speak" aria-label="${t('listen')}" title="${t('listen')} (R)">${ICON.speak}</button>` : ''}
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="choices">${options
        .map((o, i) => `<button class="choice" data-id="${esc(o.id)}"><span>${esc(shortMeaning(o.zh))}</span><kbd>${i + 1}</kbd></button>`)
        .join('')}</div>`,
      metaHTML(w, 'choice'),
    );
    const say = () => speak(displayWord(w));
    $('#speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    if (state.settings.autoSpeak) say();
    const choose = (id) => {
      if (answered) return;
      answered = true;
      const ok = id === w.id;
      sound(ok ? 'right' : 'wrong');
      $$('.choice').forEach((b) => b.classList.add(b.dataset.id === w.id ? 'correct' : b.dataset.id === id ? 'wrong' : 'dim'));
      const extra = [posLabel(w.pos), pluralLabel(w), w.forms].filter(Boolean).map(esc).join(' · ');
      $('#fb').className = `feedback ${ok ? 'ok' : 'bad'}`;
      $('#fb').innerHTML = `
        ${extra ? `<div class="fb-hint">${extra}</div>` : ''}
        ${w.example ? `<div class="fb-hint" lang="de">${esc(w.example)}</div>` : ''}
        ${ok ? '' : `<div class="tap-hint">${t('drill.tapToContinue')}</div><a class="edit-link" href="${wordLink(w, from)}">${ICON.edit} ${t('edit')}</a>`}`;
      sayAfter(displayWord(w), ok ? 250 : 0);
      rate(w, autoGrade(ok, Date.now() - shownAt, 6000), shownAt, { advance: false, how: 'choice' });
      afterAnswer({ pause: !ok });
    };
    $$('.choice').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (guard.accept(e) && !answered) choose(b.dataset.id);
      }),
    );
    keyHandler = (e) => {
      const o = options[+e.key - 1];
      if (o) choose(o.id);
      else if (e.key === 'r' || e.key === 'p') say();
      else if ((e.key === 'z' || e.key === 'u') && !practice) doUndo();
    };
  }

  // ---- article: only the article of a noun
  function articleCard(w) {
    const shownAt = Date.now();
    let answered = false;
    shell(
      `<div class="card-body">
        <div class="drill-word${w.lemma.length > 18 ? ' long' : ''}" lang="de">${esc(w.lemma)}</div>
        <div class="drill-zh">${esc(shortMeaning(w.zh))}</div>
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="art-buttons">
        ${ARTICLES.map((a, i) => `<button class="art-btn b-${a}" data-a="${a}" lang="de">${a}<kbd>${i + 1}</kbd></button>`).join('')}
      </div>`,
      metaHTML(w, 'article'),
    );
    const choose = (a) => {
      if (answered) return;
      answered = true;
      const ok = a === w.article;
      sound(ok ? 'right' : 'wrong');
      $$('.art-btn').forEach((b) => b.classList.add(b.dataset.a === w.article ? 'correct' : b.dataset.a === a ? 'wrong' : 'dim'));
      const { hint, exception } = articleHint(w);
      const pl = pluralLabel(w);
      const pause = !ok || exception;
      $('#fb').innerHTML = `
        <div class="fb-badge">${ok ? t('drill.correct') : t('drill.wrong')}</div>
        <div class="fb-word" lang="de">${wordHTML(w)}${pl ? `<span class="secondary"> · ${esc(pl)}</span>` : ''}</div>
        ${hint ? `<div class="fb-hint">${hint}</div>` : ''}
        ${pause ? `<div class="tap-hint">${t('drill.tapToContinue')}</div><a class="edit-link" href="${wordLink(w, from)}">${ICON.edit} ${t('edit')}</a>` : ''}`;
      $('#fb').className = `feedback ${ok ? 'ok' : 'bad'}`;
      sayAfter(displayWord(w), 250);
      rate(w, autoGrade(ok, Date.now() - shownAt, 2500), shownAt, { advance: false, article: { ok }, how: 'article' });
      // pause on a miss or an exception so it can sink in
      afterAnswer({ pause });
    };
    $$('.art-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (guard.accept(e) && !answered) choose(b.dataset.a);
      }),
    );
    keyHandler = (e) => {
      const map = { 1: 'der', 2: 'die', 3: 'das', j: 'der', k: 'die', l: 'das' };
      if (map[e.key]) choose(map[e.key]);
    };
  }

  // ---- spell: see the meaning, type the German
  function spellCard(w) {
    const shownAt = Date.now();
    const needArticle = w.pos === 'noun' && w.article;
    const hint = [posLabel(w.pos), needArticle ? t('spell.withArticle') : '', w.pos === 'verb' ? t('spell.infinitive') : '']
      .filter(Boolean)
      .join(' · ');
    shell(
      `<div class="card-body">
        <div class="big-zh">${esc(shortMeaning(w.zh))}</div>
        ${hint ? `<div class="secondary t-sub hint-line">${hint}</div>` : ''}
        ${w.exampleZh ? `<div class="example secondary">${esc(w.exampleZh)}</div>` : ''}
        <form id="spellForm" class="spell-form" autocomplete="off">
          <input id="spellIn" lang="de" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${needArticle ? 'der / die / das …' : esc(t('spell.ph'))}">
          <div class="umlauts">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map((c) => `<button type="button" data-c="${c}">${c}</button>`).join('')}</div>
        </form>
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="two">
        <button class="btn gray" id="giveUp">${t('spell.reveal')}</button>
        <button class="btn" id="check">${t('spell.check')}<kbd>↵</kbd></button>
      </div>`,
      metaHTML(w, 'spell'),
    );
    const input = $('#spellIn');
    // On touch screens the keyboard stays down until needed: recalling without typing is fine.
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => input.focus(), 50);
    $$('.umlauts button').forEach((b) =>
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: en, value } = input;
        input.value = value.slice(0, s) + b.dataset.c + value.slice(en);
        input.setSelectionRange(s + 1, s + 1);
        input.focus();
      }),
    );
    const spellRate = (g, opts = {}) => rate(w, g, shownAt, { how: 'spell', ...opts });

    let checked = false;
    const finishCard = (res) => {
      checked = true;
      input.disabled = true;
      input.blur();
      // nothing typed: the empty field has nothing more to say
      if (!input.value.trim()) $('#spellForm').style.display = 'none';
      const self = res.result === 'self';
      const cls = self ? 'shown' : res.result === 'exact' ? 'ok' : res.result === 'near' ? 'near' : 'bad';
      if (cls === 'ok') sound('right');
      else if (cls === 'bad') sound('wrong');
      const fb = $('#fb');
      fb.className = `feedback ${cls}`;
      fb.innerHTML = `
        ${self ? '' : `<div class="fb-badge">${t(`spell.${cls}`)}</div>`}
        <div class="fb-word" lang="de">${wordHTML(w)}</div>
        ${res.why ? `<div class="fb-hint">${t(`spell.why.${res.why}`)}</div>` : ''}
        ${w.example ? `<div class="fb-hint" lang="de">${esc(w.example)}</div>` : ''}
        <a class="edit-link" href="${wordLink(w, from)}">${ICON.edit} ${t('edit')}</a>`;
      sayAfter(displayWord(w), cls === 'ok' || cls === 'bad' ? 250 : 0);

      // Typed exactly right: that is "know", no need to say so again.
      if (cls === 'ok') {
        spellRate(3, { advance: false });
        $('.study-actions').innerHTML = `<button class="btn" id="nextCard">${t('continue')}<kbd>↵</kbd></button>`;
        $('#nextCard').addEventListener('click', tap(next));
        later(next, 1200);
        keyHandler = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            next();
          } else if ((e.key === 'z' || e.key === 'u') && !practice) doUndo();
        };
        return;
      }
      let buttons;
      let def = null;
      if (self) buttons = null;
      else if (cls === 'near') {
        buttons = [
          [1, t('rate.1')],
          [2, t('spell.countRight')],
        ];
        def = 2;
      } else {
        buttons = [
          [1, t('rate.1')],
          [3, t('spell.iWasRight')],
        ];
        def = 1;
      }
      if (!buttons) {
        // showed the answer without typing: rate it like a recall card
        showRating([1, 2, 3], (g) => spellRate(g));
        keyHandler = (e) => {
          const g = keyGrade(e.key, [1, 2, 3]);
          if (g) spellRate(g);
          else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            spellRate(3);
          }
        };
        return;
      }
      // in practice a near miss counts as "got it" and a wrong answer as "not yet"
      const shown = practice ? buttons.filter(([g]) => g === 1 || g === 3 || g === 2) : buttons;
      $('.study-actions').innerHTML = `<div class="rate n${shown.length}">${shown
        .map(([g, l]) => `<button class="r${g} ${g === def ? 'def' : ''}" data-g="${g}"><b>${l}</b></button>`)
        .join('')}</div>`;
      $$('.rate button').forEach((b) => b.addEventListener('click', tap(() => spellRate(+b.dataset.g))));
      keyHandler = (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && def) {
          e.preventDefault();
          spellRate(def);
        } else if (['1', '2', '3'].includes(e.key) && buttons.some(([g]) => g === +e.key)) {
          spellRate(+e.key);
        }
      };
    };
    const check = () => {
      if (checked) return;
      const v = input.value.trim();
      if (!v) return input.focus();
      finishCard(checkSpelling(v, w));
    };
    $('#spellForm').addEventListener('submit', (e) => {
      e.preventDefault();
      check();
    });
    $('#check').addEventListener('click', tap(check));
    // Showing the answer without typing turns the card into a self-rated recall.
    $('#giveUp').addEventListener(
      'click',
      tap(() => !checked && finishCard({ result: 'self' })),
    );
  }

  function finish() {
    keyHandler = null;
    const now = Date.now();
    if (practice) return finishPractice();
    const pending = [];
    for (const w of S.liveWords()) {
      const c = w.cards.meaning;
      if (rechecking(c, now)) pending.push(c.recheck);
    }
    pending.sort((a, b) => a - b);
    const counts = S.todayCounts();
    if (session.done) {
      sound('done');
      lastSummary = { ids: [...missed.keys()], done: session.done, again: session.again, at: now };
    }
    // Back from editing a word after the session: nothing new was answered, show the same page.
    const sum = session.done ? lastSummary : lastSummary && now - lastSummary.at < 30 * 60_000 ? lastSummary : null;
    const missedWords = (sum?.ids || []).map((id) => state.words.get(id)).filter((w) => w && !w.deleted);
    const SHOWN = 30;
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar"><a href="#home" class="icon-btn glass" aria-label="${t('study.end')}" title="${t('study.end')}">${ICON.close}</a><span></span><span></span></div>
        <div class="finish">
          <div class="done-circle">${ICON.check}</div>
          <h2>${sum ? t('finish.title') : t('finish.none')}</h2>
          ${sum ? `<p class="secondary">${t('finish.summary', { n: sum.done, again: sum.again })}</p>` : ''}
          ${
            pending.length
              ? `<p class="secondary t-sub">${t('finish.pending', { n: pending.length, t: fmtIvl(Math.max(60_000, pending[0] - now)) })}</p>`
              : ''
          }
          ${
            missedWords.length
              ? `<section class="finish-list">
                  <div class="section-header">${t('finish.missed', { n: missedWords.length })}</div>
                  <div class="list">${missedWords
                    .slice(0, SHOWN)
                    .map((w) => row({ title: `<span lang="de">${wordHTML(w)}</span>`, sub: esc(shortMeaning(w.zh)), href: wordLink(w, 'study') }))
                    .join('')}</div>
                  ${missedWords.length > SHOWN ? `<div class="section-footer">${t('finish.missedMore', { n: missedWords.length - SHOWN })}</div>` : ''}
                </section>`
              : ''
          }
          <div class="btns">
            ${pending.length ? `<button class="btn" id="seeAgain">${t('finish.seeAgain', { n: pending.length })}</button>` : ''}
            ${
              !counts.total && counts.unseen
                ? `<button class="btn" id="moreNew">${t('home.moreNew', { n: Math.min(10, counts.unseen) })}</button>`
                : ''
            }
            ${missedWords.length ? `<button class="btn tinted" id="practiceMissed">${t('finish.practiceMissed')}</button>` : ''}
            <a class="btn gray" href="#home">${t('finish.home')}</a>
          </div>
        </div>
      </div>`;
    $('#moreNew')?.addEventListener('click', async () => {
      await S.addExtraNew(Math.min(10, counts.unseen));
      next();
    });
    // The round stops rather than show the word just answered right away again; whoever
    // doesn't want to come back in a minute can go on now.
    $('#seeAgain')?.addEventListener('click', () => {
      session.lastWordId = null;
      next();
    });
    // Free practice never touches the schedule, so it is safe to go over the misses again.
    $('#practiceMissed')?.addEventListener('click', () => startPractice({ ids: missedWords.map((w) => w.id), back: '#home' }));
    syncNow();
  }

  function finishPractice() {
    sound('done');
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar"><a href="${practiceBack}" class="icon-btn glass" aria-label="${t('study.end')}" title="${t('study.end')}">${ICON.close}</a><span></span><span></span></div>
        <div class="finish">
          <div class="done-circle">${ICON.check}</div>
          <h2>${t('practice.doneTitle')}</h2>
          <p class="secondary">${t('practice.doneBody', { n: total, again: session.again })}</p>
          <p class="secondary t-foot">${t('practice.foot')}</p>
          <div class="btns">
            <button class="btn" id="again">${t('practice.restart')}</button>
            ${from === 'practice' ? `<button class="btn tinted" id="otherMode">${t('practice.otherMode')}</button>` : ''}
            <a class="btn gray" href="${practiceBack}">${practiceBack === '#words' ? t('practice.back') : t('finish.home')}</a>
          </div>
        </div>
      </div>`;
    $('#again').addEventListener('click', () => route());
    $('#otherMode')?.addEventListener('click', () => startPractice({ ids: practicePicked, back: practiceBack }));
  }

  next();
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    syncNow();
  };
}

function wordsView() {
  let q = '';
  const tags = S.allTags();
  let tag = local.get('wordsTag', 'all');
  if (tag !== 'all' && !tags.includes(tag)) tag = 'all';
  let status = local.get('wordsStatus', 'all');
  let limit = 150;
  let list = [];
  let selecting = false;
  const selected = new Set();

  const setWordsNav = () =>
    setNav({
      title: t('tab.words'),
      extra: `<button class="nav-pill glass" id="selectBtn">${selecting ? t('words.done') : t('words.select')}</button>`,
    });
  setWordsNav();

  $app.innerHTML = `
    ${largeTitle(t('tab.words'))}
    <div class="search">${ICON.search}<input id="search" type="search" placeholder="${esc(t('words.search'))}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
    <div class="menus">
      ${
        tags.length
          ? `<select id="fTag" class="menu">
              <option value="all">${t('words.allTags')}</option>
              ${tags.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}
            </select>`
          : ''
      }
      <select id="fStatus" class="menu">
        <option value="all">${t('words.allStatus')}</option>
        ${S.STATUSES.map((k) => `<option value="${k}">${t(`st.${k}`)}</option>`).join('')}
        <option value="hardArticle">${t('words.hardArticle')}</option>
        <option value="incomplete">${t('words.incomplete')}</option>
      </select>
    </div>
    <section class="section">
      <div class="section-header list-head"><span id="count"></span><button class="head-btn" id="practiceList" hidden>${ICON.practice}${t('words.practiceList')}</button></div>
      <div class="list" id="list"></div>
    </section>
    <div class="select-bar glass" id="selectBar" hidden>
      <div class="sel-info"><button class="sel-text" id="selAll"></button><span class="sel-count" id="selCount"></span></div>
      <button class="sel-act" id="selPractice">${ICON.practice}<span>${t('words.practice')}</span></button>
      <button class="sel-act" id="selTag">${ICON.tag}<span>${t('edit.tags')}</span></button>
      <button class="sel-act" id="selSuspend"></button>
      <button class="sel-act danger" id="selDelete">${ICON.trash}<span>${t('words.delete')}</span></button>
    </div>`;
  if ($('#fTag')) $('#fTag').value = tag;
  $('#fStatus').value = status;

  const incomplete = (w) => !w.zh || (w.pos === 'noun' && (!w.article || !w.plural));

  function filter() {
    const ql = q.toLowerCase();
    list = S.liveWords().filter((w) => {
      if (tag !== 'all' && !(w.tags || []).includes(tag)) return false;
      if (status === 'hardArticle') {
        if (!S.articleMisses(w)) return false;
      } else if (status === 'incomplete') {
        if (!incomplete(w)) return false;
      } else if (status !== 'all' && S.wordStatus(w) !== status) return false;
      if (!ql) return true;
      return (
        w.lemma.toLowerCase().includes(ql) ||
        (w.zh || '').toLowerCase().includes(ql) ||
        (w.tags || []).some((x) => x.toLowerCase().includes(ql)) ||
        (w.plural || '').toLowerCase().includes(ql)
      );
    });
    if (status === 'hardArticle') list.sort((a, b) => S.articleMisses(b) - S.articleMisses(a));
    else list.sort((a, b) => b.createdAt - a.createdAt);
  }

  function render() {
    filter();
    const progress = tag === 'all' ? null : S.tagProgress().find((r) => r.tag === tag);
    $('#count').textContent = [t('n.words', { n: list.length }), progress ? listProgressText(progress) : ''].filter(Boolean).join(' · ');
    // What a tag, a status or a search narrowed down can be practiced as it is.
    $('#practiceList').hidden = selecting || !list.length || (tag === 'all' && status === 'all' && !q);
    const box = $('#list');
    box.hidden = !list.length;
    box.innerHTML =
      list
        .slice(0, limit)
        .map((w) => {
          const st = S.wordStatus(w);
          const pl = w.plural && w.plural !== NO_PLURAL ? `<span class="secondary t-sub"> · ${esc(w.plural)}</span>` : '';
          const title = `<span class="wr-de" lang="de">${wordHTML(w)}${pl}</span>`;
          const sub = esc(shortMeaning(w.zh)) || `<span class="warn-text">${t('words.noMeaning')}</span>`;
          const detail = `<span class="status s-${st}">${t(`st.${st}`)}</span>`;
          if (!selecting) return row({ title, sub, detail, href: wordLink(w) });
          const on = selected.has(w.id);
          return `<button class="row pick ${on ? 'on' : ''}" data-id="${esc(w.id)}" aria-pressed="${on}">
            <span class="check">${ICON.check}</span>
            <div class="row-main"><div class="row-title">${title}</div><div class="row-sub">${sub}</div></div>
            <div class="row-detail">${detail}</div>
          </button>`;
        })
        .join('') +
      (list.length > limit
        ? `<button class="row action center" id="more">${t('words.more', { n: Math.min(150, list.length - limit) })}</button>`
        : '');
    $('#empty')?.remove();
    if (!list.length) box.insertAdjacentHTML('afterend', `<p class="empty" id="empty">${t('words.empty')}</p>`);
    $('#more')?.addEventListener('click', () => {
      limit += 150;
      render();
    });
    renderBar();
  }

  const selectedWords = () => [...selected].map((id) => state.words.get(id)).filter((w) => w && !w.deleted);

  function renderBar() {
    const bar = $('#selectBar');
    bar.hidden = !selecting;
    document.body.classList.toggle('selecting', selecting);
    if (!selecting) return;
    const chosen = selectedWords();
    const allOn = list.length > 0 && list.every((w) => selected.has(w.id));
    const allSuspended = chosen.length > 0 && chosen.every((w) => w.suspended);
    $('#selAll').textContent = allOn ? t('words.selectNone') : t('words.selectAll');
    $('#selCount').textContent = t('words.selected', { n: chosen.length });
    $('#selSuspend').innerHTML = allSuspended ? `${ICON.play}<span>${t('words.resume')}</span>` : `${ICON.pause}<span>${t('words.suspend')}</span>`;
    for (const id of ['selPractice', 'selTag', 'selSuspend', 'selDelete']) $(`#${id}`).disabled = !chosen.length;
  }

  function setSelecting(on) {
    selecting = on;
    selected.clear();
    setWordsNav();
    bindSelectBtn();
    render();
  }
  function bindSelectBtn() {
    document.getElementById('selectBtn').addEventListener('click', () => setSelecting(!selecting));
  }
  bindSelectBtn();

  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('.pick');
    if (!b) return;
    const id = b.dataset.id;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    b.classList.toggle('on', selected.has(id));
    b.setAttribute('aria-pressed', selected.has(id));
    renderBar();
  });
  // "Select all" applies to the current search and filters, so a whole tag can be handled at once.
  $('#selAll').addEventListener('click', () => {
    const allOn = list.every((w) => selected.has(w.id));
    for (const w of list) allOn ? selected.delete(w.id) : selected.add(w.id);
    render();
  });
  $('#selPractice').addEventListener('click', () => startPractice({ ids: selectedWords().map((w) => w.id), back: '#words' }));
  $('#practiceList').addEventListener('click', () => startPractice({ ids: list.map((w) => w.id), back: '#words' }));
  // Tags of the selection: add some, or take one off every selected word that has it. The
  // selection stays, so the same words can be practiced or tagged further.
  $('#selTag').addEventListener('click', async () => {
    const chosen = selectedWords();
    const has = new Map();
    for (const w of chosen) for (const tag of w.tags || []) has.set(tag, (has.get(tag) || 0) + 1);
    const ADD = Symbol('add');
    const pick = has.size
      ? await dialog({
          message: t('words.tagTitle', { n: chosen.length }),
          options: [
            { value: ADD, label: t('words.addTag'), sub: t('words.addTagSub') },
            ...[...has].map(([tag, n]) => ({ value: tag, label: t('words.removeTag', { tag }), sub: t('words.removeTagSub', { n }) })),
          ],
        })
      : ADD;
    if (pick === null) return;
    if (pick === ADD) {
      const input = await dialog({ message: t('words.addTagPrompt'), confirm: t('dlg.add'), input: { placeholder: t('words.tagPh') } });
      const add = (input || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      if (!add.length) return;
      await S.updateWords(chosen, (w) => (w.tags = [...new Set([...(w.tags || []), ...add])]));
      toast(t('words.tagged', { n: chosen.length }));
    } else {
      const had = chosen.filter((w) => (w.tags || []).includes(pick));
      const before = new Map(had.map((w) => [w.id, w.tags]));
      await S.updateWords(had, (w) => (w.tags = w.tags.filter((x) => x !== pick)));
      toast(t('words.untagged', { n: had.length, tag: pick }), {
        action: t('study.undo'),
        onAction: async () => {
          await S.updateWords(had, (w) => (w.tags = before.get(w.id)));
          if (current === 'words') refreshView?.();
        },
      });
    }
    refreshView?.();
  });
  $('#selSuspend').addEventListener('click', async () => {
    const chosen = selectedWords();
    const resume = chosen.every((w) => w.suspended);
    await S.updateWords(chosen, (w) => (w.suspended = !resume));
    toast(t(resume ? 'words.resumedN' : 'words.suspendedN', { n: chosen.length }));
    render();
  });
  $('#selDelete').addEventListener('click', async () => {
    const chosen = selectedWords();
    if (!(await dialog({ message: t('words.confirmDelete', { n: chosen.length }), confirm: t('words.delete'), destructive: true }))) return;
    await S.updateWords(chosen, (w) => (w.deleted = true));
    setSelecting(false);
    toast(t('words.deletedN', { n: chosen.length }), {
      action: t('study.undo'),
      onAction: async () => {
        await S.updateWords(chosen, (w) => (w.deleted = false));
        if (current === 'words') route();
      },
    });
  });

  $('#search').addEventListener('input', (e) => {
    q = e.target.value.trim();
    limit = 150;
    render();
  });
  $('#fTag')?.addEventListener('change', (e) => {
    tag = e.target.value;
    local.set('wordsTag', tag);
    render();
  });
  $('#fStatus').addEventListener('change', (e) => {
    status = e.target.value;
    local.set('wordsStatus', status);
    render();
  });
  render();
  refreshView = () => {
    for (const id of selected) if (!state.words.get(id) || state.words.get(id).deleted) selected.delete(id);
    // Another device may have added tags; keep the menu current without leaving the page.
    const menu = $('#fTag');
    const fresh = S.allTags();
    if (menu && fresh.join('\n') !== tags.join('\n')) {
      tags.splice(0, tags.length, ...fresh);
      if (tag !== 'all' && !tags.includes(tag)) tag = 'all';
      menu.innerHTML = `<option value="all">${t('words.allTags')}</option>${tags.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}`;
      menu.value = tag;
    }
    render();
  };
  return () => document.body.classList.remove('selecting');
}

function editView(id, from) {
  let w = state.words.get(id);
  const back = STUDY_VIEWS.includes(from) ? { href: `#${from}`, label: t('edit.backToStudy') } : { href: '#words', label: t('tab.words') };
  if (!w || w.deleted) {
    setNav({ title: '', back, large: false });
    $app.innerHTML = `<p class="empty">${t('edit.notFound')}</p>`;
    return;
  }
  setNav({ title: displayWord(w), back, large: false });
  const options = (keys, prefix, cur) =>
    keys.map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t(`${prefix}.${k}`)}</option>`).join('');
  // Where the word stands, in plain words: its status, when it comes next, how it went so far.
  const card = S.getCard(w, 'meaning');
  const misses = S.articleMisses(w);
  const progressRow = row({
    title: t(`st.${S.wordStatus(w)}`),
    sub: [card.state === 'new' ? '' : t('edit.progressSub', { r: card.reps || 0, l: card.lapses || 0, d: card.s.toFixed(1) }), misses ? t('edit.articleMisses', { n: misses }) : '']
      .filter(Boolean)
      .join(' · '),
    detail: w.suspended ? '' : dueText(card),
  });
  const noAutoFix = 'autocapitalize="off" autocorrect="off" spellcheck="false"';
  const dictionaries = dictLinks(lookupTerm(w), getLang());

  $app.innerHTML = `
    <div class="spacer"></div>
    <form id="editForm">
      <section class="section">
        <div class="section-header">${t('edit.word')}</div>
        <div class="list">
          <div class="row">
            <div class="segmented in-row" id="artSeg">
              ${['', ...ARTICLES]
                .map((a) => `<button type="button" data-a="${a}" class="${a === (w.article || '') ? 'on' : ''}">${a || t('edit.noArticle')}</button>`)
                .join('')}
            </div>
          </div>
          <label class="row field"><span>${t('edit.german')}</span><input name="lemma" value="${esc(w.lemma)}" required lang="de" ${noAutoFix}></label>
          <label class="row field" id="pluralRow"><span>${t('edit.plural')}</span><input name="plural" value="${esc(w.plural)}" placeholder="${esc(t('edit.pluralPh'))}" lang="de" ${noAutoFix}></label>
          <label class="row field"><span>${t('edit.pos')}</span><select name="pos"><option value="">${t('edit.posUnset')}</option>${options(POS, 'pos', w.pos)}</select>${ICON.chev}</label>
          <label class="row field" id="formsRow"><span>${t('edit.forms')}</span><input name="forms" value="${esc(w.forms)}" lang="de" ${noAutoFix}></label>
        </div>
      </section>
      <section class="section">
        <div class="section-header">${t('edit.meaning')}</div>
        <div class="list">
          <label class="row field stack"><span>${t('edit.meaning')}</span><textarea name="zh" rows="1">${esc(w.zh)}</textarea></label>
          <label class="row field stack"><span>${t('edit.example')}</span><textarea name="example" rows="1" lang="de" ${noAutoFix}>${esc(w.example)}</textarea></label>
          <label class="row field stack"><span>${t('edit.exampleTr')}</span><textarea name="exampleZh" rows="1">${esc(w.exampleZh)}</textarea></label>
          <label class="row field stack"><span>${t('edit.notes')}</span><textarea name="notes" rows="1" placeholder="${esc(t('edit.notesPh'))}">${esc(w.notes)}</textarea></label>
        </div>
      </section>
      <section class="section">
        <div class="list">
          <label class="row field"><span>${t('edit.tags')}</span><input name="tags" value="${esc((w.tags || []).join(', '))}" placeholder="${esc(t('edit.tagsPh'))}" autocomplete="off"></label>
        </div>
      </section>
    </form>
    ${
      dictionaries.length
        ? `<section class="section">
            <div class="section-header">${t('dict.title')}</div>
            <div class="list">${dictionaries
              .map((d) => row({ title: esc(d.name), href: esc(d.href), attrs: 'target="_blank" rel="noopener noreferrer"', detail: ICON.ext, chevron: false }))
              .join('')}</div>
            <div class="section-footer">${t('dict.foot')}</div>
          </section>`
        : ''
    }
    <section class="section">
      <div class="section-header">${t('edit.progress')}</div>
      <div class="list">${progressRow}</div>
    </section>
    <section class="section">
      <div class="list">
        ${ttsAvailable() ? `<button class="row action" id="speak">${t('listen')}</button>` : ''}
        <button class="row action" id="suspend">${w.suspended ? t('edit.resume') : t('edit.suspend')}</button>
        <button class="row action" id="reset">${t('edit.reset')}</button>
      </div>
    </section>
    <section class="section">
      <div class="list"><button class="row destructive" id="del">${t('edit.delete')}</button></div>
    </section>`;

  // Edits save automatically, like the iOS Settings and Contacts apps.
  const form = $('#editForm');
  $$('.field textarea', form).forEach(autoGrow);
  let article = w.article || '';
  let timer = null;
  const queueSave = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    save();
  };
  $('#artSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    article = b.dataset.a;
    $$('#artSeg button').forEach((x) => x.classList.toggle('on', x === b));
    queueSave();
  });
  form.addEventListener('input', queueSave);
  form.addEventListener('change', queueSave);
  // Only the fields that fit the word class are shown, and never one that already has text:
  // a plural for nouns, forms for verbs and adjectives.
  const fitFields = () => {
    const pos = form.elements.pos.value;
    $('#pluralRow').hidden = !['', 'noun'].includes(pos) && !form.elements.plural.value;
    $('#formsRow').hidden = !['', 'verb', 'adj', 'other'].includes(pos) && !form.elements.forms.value;
    form.elements.forms.placeholder = pos === 'verb' ? t('edit.formsPh') : pos === 'adj' ? t('edit.formsPhAdj') : '';
  };
  fitFields();
  form.elements.pos.addEventListener('change', fitFields);
  $('#speak')?.addEventListener('click', () => speak(displayWord(w)));
  async function save() {
    timer = null;
    const f = Object.fromEntries(new FormData(form));
    if (!f.lemma.trim()) return;
    // Write onto the latest copy so review progress synced meanwhile is kept.
    w = state.words.get(w.id) || w;
    Object.assign(w, {
      editedAt: Date.now(),
      article,
      lemma: f.lemma.trim(),
      pos: f.pos || (article ? 'noun' : ''),
      plural: f.plural.trim(),
      forms: f.forms.trim(),
      zh: f.zh.trim(),
      example: f.example.trim(),
      exampleZh: f.exampleZh.trim(),
      notes: f.notes.trim(),
      tags: f.tags
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    await S.saveWord(w);
    document.getElementById('navTitle').textContent = displayWord(w);
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    flush();
  });
  $('#suspend').addEventListener('click', async () => {
    flush();
    w = state.words.get(w.id) || w;
    w.suspended = !w.suspended;
    w.editedAt = Date.now();
    await S.saveWord(w);
    toast(w.suspended ? t('edit.suspended') : t('edit.resumed'));
    route();
  });
  $('#reset').addEventListener('click', async () => {
    if (!(await dialog({ message: t('edit.confirmReset'), confirm: t('dlg.reset'), destructive: true }))) return;
    await S.resetProgress(w);
    route();
  });
  $('#del').addEventListener('click', async () => {
    if (!(await dialog({ message: t('edit.confirmDelete', { w: displayWord(w) }), confirm: t('words.delete'), destructive: true }))) return;
    clearTimeout(timer);
    timer = null;
    await S.deleteWord(w);
    // as in the word list, a deletion can be taken back for a moment
    const gone = w;
    toast(t('edit.deleted'), {
      action: t('study.undo'),
      onAction: async () => {
        await S.updateWords([gone], (x) => (x.deleted = false));
        if (current === 'words') route();
      },
    });
    location.hash = back.href;
  });
  return flush;
}

const PREVIEW_LIMIT = 200;

const COLUMN_LABEL = {
  lemma: 'edit.german',
  zh: 'edit.meaning',
  article: 'type.article',
  plural: 'edit.plural',
  pos: 'edit.pos',
  forms: 'edit.forms',
  example: 'edit.example',
  exampleZh: 'edit.exampleTr',
  notes: 'edit.notes',
  tags: 'edit.tags',
  status: 'add.col.status',
  suspended: 'add.col.suspended',
};
const columnName = (field) => t(COLUMN_LABEL[field]);

function addView() {
  setNav({ title: t('add.title') });
  let items = [];
  // Meanings and articles typed into the preview, keyed by the source line, so they
  // survive re-parsing while the list is still being edited.
  const fills = new Map();
  // Rows read from a file sit next to the typed lines; removed ones are remembered by line.
  let file = null;
  const removed = new Set();
  const knownTags = S.allTags().slice(0, 12);
  // What happens to words already in the library: skip them, fill in what they lack, or take
  // what the file has. Filling in is safe to start with: it never changes what is there.
  let mode = local.get('importMode', 'fill');
  $app.innerHTML = `
    ${largeTitle(t('add.title'))}
    <section class="section">
      <div class="section-header">${t('add.paste')}</div>
      <div class="list">
        <div class="row">
          <textarea class="bare lines-input" id="lines" rows="6" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(t('add.ph'))}"></textarea>
        </div>
      </div>
      <div class="section-footer">${esc(t('add.foot'))}</div>
    </section>
    <div id="preview"></div>
    <section class="section" id="tagsSection" hidden>
      <div class="list">
        <label class="row field"><span>${t('edit.tags')}</span><input id="tags" placeholder="${esc(t('add.tagsPh'))}" autocomplete="off"></label>
        ${
          knownTags.length
            ? `<div class="row tag-chips">${knownTags.map((tag) => `<button type="button" class="chip" data-tag="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>`
            : ''
        }
      </div>
      <div class="section-footer">${t('add.tagsFoot')}</div>
    </section>
    <section class="section" id="importSection" hidden>
      <button class="btn" id="import"></button>
    </section>
    <section class="section">
      <div class="section-header">${t('add.fromFile')}</div>
      <div class="list">
        <div class="row file-row" id="fileRow" hidden>
          <span class="ic gray">${ICON.doc}</span>
          <div class="row-main"><div class="row-title" id="fileName"></div><div class="row-sub" id="fileCols"></div></div>
          <button class="x" id="clearFile" aria-label="${t('add.clearFile')}">✕</button>
        </div>
        <label class="row action has-icon" id="pickFile">${icon('doc', 'blue')}<div class="row-main">${t('add.pickFile')}</div>
          <input type="file" id="fileInput" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values" hidden>
        </label>
        <button class="row action has-icon" id="template">${icon('down', 'green')}<div class="row-main">${t('add.template')}</div></button>
        ${row({ title: t('help.title'), icon: icon('book', 'gray'), href: '#formats' })}
      </div>
      <div class="section-footer">${esc(t('add.fileFoot'))}</div>
    </section>`;

  const lines = $('#lines');
  const tagsInput = $('#tags');
  const tagList = () =>
    tagsInput.value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  const syncChips = () => {
    const current = tagList();
    $$('.tag-chips .chip').forEach((c) => c.classList.toggle('on', current.includes(c.dataset.tag)));
  };
  // Tapping a used tag toggles it in the field.
  $$('.tag-chips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      const current = tagList();
      const next = current.includes(c.dataset.tag) ? current.filter((x) => x !== c.dataset.tag) : [...current, c.dataset.tag];
      tagsInput.value = next.join(', ');
      syncChips();
    }),
  );
  tagsInput.addEventListener('input', syncChips);
  // The tags go to words already in the library as well, which the preview lists.
  let tagsTimer;
  const onTags = () => {
    clearTimeout(tagsTimer);
    tagsTimer = setTimeout(() => items.length && renderPreview(), 250);
  };
  tagsInput.addEventListener('input', onTags);
  $$('.tag-chips .chip').forEach((c) => c.addEventListener('click', onTags));

  function parse() {
    const fromFile = file ? file.items.filter((it) => !removed.has(it.raw)).map((it) => ({ ...it, fromFile: true })) : [];
    items = [...fromFile, ...lines.value.split(/\r?\n/).map(parseLine).filter(Boolean)];
    const seen = new Set();
    for (const it of items) {
      Object.assign(it, fills.get(it.raw));
      const key = `${it.article}|${it.lemma.toLowerCase()}`;
      it.existing = seen.has(key) ? null : S.findDuplicate(it.lemma, it.article);
      it.dup = Boolean(it.existing) || seen.has(key);
      seen.add(key);
    }
    renderPreview();
  }
  let parseTimer;
  lines.addEventListener('input', () => {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(parse, 250);
  });

  async function loadFile(f) {
    if (!f) return;
    try {
      const { items: rows, columns } = await itemsFromFile(f);
      if (!rows.length) return toast(t('add.fileEmpty'), 3500);
      file = { name: f.name, items: rows };
      removed.clear();
      $('#fileRow').hidden = false;
      $('#fileName').textContent = t('add.fileLoaded', { name: f.name, n: rows.length });
      // Say how the file was read, so a wrong column is noticed before importing.
      $('#fileCols').textContent = columns.length
        ? t('add.columns', { list: columns.map(columnName).join(locale().startsWith('zh') ? '、' : ', ') })
        : t('add.byLine');
      parse();
      $('#preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      toast(t('add.fileError'), 3500);
    }
  }
  $('#fileInput').addEventListener('change', (e) => {
    loadFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#template').addEventListener('click', downloadTemplate);
  $('#clearFile').addEventListener('click', () => {
    file = null;
    $('#fileRow').hidden = true;
    parse();
  });
  // Files can also be dropped anywhere on the page (Mac, iPad drag and drop).
  const onDragOver = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    document.body.classList.add('dropping');
  };
  const onDragLeave = (e) => {
    if (!e.relatedTarget) document.body.classList.remove('dropping');
  };
  const onDrop = (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    document.body.classList.remove('dropping');
    loadFile(e.dataTransfer.files[0]);
  };
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('drop', onDrop);

  const fill = (it, patch) => {
    Object.assign(it, patch);
    fills.set(it.raw, { ...fills.get(it.raw), ...patch });
  };

  // What each row matching a word in the library would change in it, against its latest copy.
  const patchOf = (it) => {
    const w = it.existing && (state.words.get(it.existing.id) || it.existing);
    return w ? updateFor(w, it, mode, tagList()) : {};
  };
  const updates = () => items.filter((it) => it.existing && Object.keys(patchOf(it)).length);
  const fieldList = (keys) => keys.map(columnName).join(locale().startsWith('zh') ? '、' : ', ');

  const headerText = () => {
    const fresh = items.filter((i) => !i.dup).length;
    const up = updates().length;
    const skip = items.length - fresh - up;
    const miss = items.filter((x) => !x.dup && isIncomplete(x)).length;
    return [t('add.new', { n: fresh }), up ? t('add.update', { n: up }) : '', skip ? t('add.dup', { n: skip }) : '', miss ? t('add.missing', { n: miss }) : '']
      .filter(Boolean)
      .join(' · ');
  };

  function renderPreview() {
    const box = $('#preview');
    const fresh = items.filter((i) => !i.dup);
    const up = updates().length;
    $('#tagsSection').hidden = $('#importSection').hidden = !items.length;
    $('#import').disabled = !fresh.length && !up;
    $('#import').textContent =
      fresh.length && up ? t('add.importBoth', { n: fresh.length, u: up }) : up ? t('add.updateOnly', { n: up }) : t('add.import', { n: fresh.length });
    if (!items.length) {
      box.innerHTML = '';
      return;
    }
    const hidden = items.length - PREVIEW_LIMIT;
    const existing = items.filter((it) => it.existing).length;
    box.innerHTML = `
      ${
        existing
          ? `<section class="section">
              <div class="section-header">${t('add.existingHead', { n: existing })}</div>
              <div class="list"><div class="row"><div class="segmented in-row" id="modeSeg">${['skip', 'fill', 'replace']
                .map((m) => `<button type="button" data-m="${m}" class="${m === mode ? 'on' : ''}">${t(`add.mode.${m}`)}</button>`)
                .join('')}</div></div></div>
              <div class="section-footer">${t(`add.modeFoot.${mode}`)}</div>
            </section>`
          : ''
      }
      <section class="section">
        <div class="section-header" id="pvHead">${headerText()}</div>
        <div class="list">
          ${items
            .slice(0, PREVIEW_LIMIT)
            .map((it, i) => {
              const pl = it.plural ? `<span class="secondary t-sub"> · ${esc(it.plural === NO_PLURAL ? t('add.noPlural') : it.plural)}</span>` : '';
              const forms = it.forms ? `<span class="secondary t-sub"> · ${esc(it.forms)}</span>` : '';
              const kind = it.pos === 'sentence' || it.pos === 'phrase' ? `<span class="kind">${posLabel(it.pos)}</span>` : '';
              let body = '';
              const changes = Object.keys(patchOf(it));
              if (it.dup) {
                const what = changes.length ? ` · ${t(mode === 'replace' ? 'add.willSet' : 'add.willFill', { list: fieldList(changes) })}` : '';
                body = `<div class="row-sub">${t(it.existing ? 'add.exists' : 'add.twice')}${what}</div>`;
              } else {
                if (it.pos === 'noun' && !it.article) {
                  body += `<div class="pv-art">${ARTICLES.map((a) => `<button class="b-${a}" data-i="${i}" data-a="${a}" lang="de">${a}</button>`).join('')}</div>`;
                }
                body += fills.get(it.raw)?.zh !== undefined || !it.zh
                  ? `<input class="pv-zh" data-i="${i}" value="${esc(it.zh)}" placeholder="${esc(t('edit.meaning'))}" autocomplete="off" enterkeyhint="next">`
                  : `<div class="row-sub">${esc(it.zh)}</div>`;
              }
              const look = !it.dup && !it.zh ? dictLinks(lookupTerm(it), getLang())[0] : null;
              const lookLink = look
                ? `<a class="lookup" href="${esc(look.href)}" target="_blank" rel="noopener noreferrer" title="${esc(t('dict.lookup', { name: look.name }))}">${ICON.search}<span>${t('dict.short')}</span></a>`
                : '';
              return `<div class="row pv ${it.dup && !changes.length ? 'dup' : ''}">
                <div class="row-main"><div class="pv-head"><div lang="de">${kind}${wordHTML(it)}${pl}${forms}</div>${lookLink}</div>${body}${it.example && !it.dup ? `<div class="row-sub" lang="de">${esc(it.example)}</div>` : ''}</div>
                <button class="x" data-i="${i}" aria-label="${t('add.remove')}">✕</button>
              </div>`;
            })
            .join('')}
          ${hidden > 0 ? `<div class="row"><div class="row-main secondary">${t('add.moreRows', { n: hidden })}</div></div>` : ''}
        </div>
        <div class="section-footer">${esc(t('add.previewFoot'))}</div>
      </section>`;
    $$('#modeSeg button', box).forEach((b) =>
      b.addEventListener('click', () => {
        mode = b.dataset.m;
        local.set('importMode', mode);
        renderPreview();
      }),
    );
    // Removing a row removes its line from the text, or drops it from the file.
    $$('.pv .x', box).forEach((b) =>
      b.addEventListener('click', () => {
        const it = items[+b.dataset.i];
        if (it.fromFile) removed.add(it.raw);
        else {
          const all = lines.value.split(/\r?\n/);
          all.splice(all.findIndex((l) => l.trim() === it.raw), 1);
          lines.value = all.join('\n');
        }
        parse();
      }),
    );
    $$('.pv-art button', box).forEach((b) =>
      b.addEventListener('click', () => {
        fill(items[+b.dataset.i], { article: b.dataset.a });
        parse();
      }),
    );
    $$('.pv-zh', box).forEach((inp) => {
      inp.addEventListener('input', () => fill(items[+inp.dataset.i], { zh: inp.value.trim() }));
      inp.addEventListener('change', () => ($('#pvHead', box).textContent = headerText()));
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const all = $$('.pv-zh', box);
        const nextInput = all[all.indexOf(inp) + 1];
        nextInput ? nextInput.focus() : inp.blur();
      });
    });
  }
  $('#import').addEventListener('click', doImport);

  async function doImport() {
    const tags = tagList();
    const base = Date.now();
    const words = items
      .filter((i) => !i.dup)
      .map(({ fromFile, dup, raw, existing, ...i }) => S.makeWord({ ...i, tags: [...new Set([...(i.tags || []), ...tags])], batch: base }));
    // keep the pasted order
    words.forEach((w, i) => (w.createdAt = base + i));
    await S.addWords(words);
    // Words already in the library get what the list adds to them; their progress stays.
    const patches = new Map(updates().map((it) => [it.existing.id, patchOf(it)]));
    const changed = [...patches.keys()].map((id) => state.words.get(id)).filter(Boolean);
    if (changed.length) await S.updateWords(changed, (w) => Object.assign(w, patches.get(w.id)));
    toast(changed.length ? t('add.importedBoth', { n: words.length, u: changed.length }) : t('add.imported', { n: words.length }));
    items = [];
    fills.clear();
    file = null;
    $('#fileRow').hidden = true;
    lines.value = '';
    renderPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (pendingFile) {
    loadFile(pendingFile);
    pendingFile = null;
  }
  const text = pendingAdd || hashParams.get('text') || '';
  if (text) {
    lines.value = text;
    pendingAdd = '';
    if (hashParams.get('tag')) {
      tagsInput.value = hashParams.get('tag');
      syncChips();
    }
    parse();
    // The sentence a word was found in becomes its example.
    const example = hashParams.get('example');
    if (example && items[0] && !items[0].example && !items[0].dup) {
      fill(items[0], { example });
      renderPreview();
    }
    $('.pv-zh')?.focus();
  }
  return () => {
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('dragleave', onDragLeave);
    document.removeEventListener('drop', onDrop);
    document.body.classList.remove('dropping');
  };
}

function formatsView() {
  setNav({ title: t('help.title'), back: { href: '#add', label: t('add.title') }, large: false });
  const cols = [
    ['lemma', 'help.col.lemma'],
    ['meaning', 'help.col.meaning'],
    ['article', 'help.col.article'],
    ['plural', 'help.col.plural'],
    ['pos', 'help.col.pos'],
    ['forms', 'help.col.forms'],
    ['example, example_translation', 'help.col.example'],
    ['notes', 'help.col.notes'],
    ['tags', 'help.col.tags'],
    ['status', 'help.col.status'],
  ];
  const steps = (key, params) => `<ol class="steps">${t(key, params).split('\n').map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const base = `${location.origin}${location.pathname}`;
  $app.innerHTML = `
    <div class="spacer"></div>
    <section class="section">
      <div class="section-header">${t('help.pasteH')}</div>
      <div class="list"><pre class="sample" lang="de">${esc(t('home.sample'))}</pre></div>
      <div class="section-footer">${esc(t('help.pasteBody'))}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.csvH')}</div>
      <div class="list">
        ${cols.map(([name, key]) => row({ title: `<code>${esc(name)}</code>`, sub: esc(t(key)), cls: 'wrap' })).join('')}
        <button class="row action has-icon" id="template">${icon('down', 'green')}<div class="row-main">${t('add.template')}</div></button>
      </div>
      <div class="section-footer">${esc(t('help.csvBody'))}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.updateH')}</div>
      <div class="list help-text"><p>${esc(t('help.updateBody'))}</p></div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.excelH')}</div>
      <div class="list help-text">${steps('help.excelSteps')}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.ankiH')}</div>
      <div class="list help-text">${steps('help.ankiSteps')}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.quickH')}</div>
      <div class="list help-text">
        <p>${esc(t('help.quickBody'))}</p>
        <pre class="sample code">${esc(`${base}#add?text=Haltestelle&example=Die Haltestelle ist dort.&tag=Reise`)}</pre>
        ${steps('help.quickSteps', { base })}
      </div>
      <div class="list">
        <button class="row action has-icon" id="copyBookmarklet">${icon('doc', 'blue')}<div class="row-main strong">${t('help.bookmarklet')}</div></button>
      </div>
      <div class="section-footer">${esc(t('help.bookmarkletFoot'))}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('help.backupH')}</div>
      <div class="list help-text"><p>${esc(t('help.backupBody'))}</p></div>
    </section>`;
  $('#template').addEventListener('click', downloadTemplate);
  $('#copyBookmarklet').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet(base));
      toast(t('help.copied'), 3500);
    } catch {
      toast(t('help.copyFailed'), 3500);
    }
  });
}

// Bookmarklet for the browser you read in: select a word, tap it, and the add screen opens
// with the word and the sentence around it. No percent signs or hashes, which some browsers
// mangle in bookmarks.
function bookmarklet(base) {
  const run = (target) => {
    const sel = getSelection();
    const word = String(sel).trim();
    if (!word) return;
    const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const para = node && node.closest('p, li, blockquote, div');
    const text = para ? para.innerText : '';
    const i = text.indexOf(word);
    let example = '';
    if (i >= 0) {
      const before = text.slice(0, i);
      const start = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('\n')) + 1;
      const end = text.slice(i).search(/[.!?](\s|$)|\n/);
      example = text.slice(start, end < 0 ? text.length : i + end + 1).trim();
    }
    if (example.length > 300 || example === word) example = '';
    open(target + String.fromCharCode(35) + 'add?text=' + encodeURIComponent(word) + (example ? '&example=' + encodeURIComponent(example) : ''));
  };
  return `javascript:(${run.toString().replace(/\s+/g, ' ')})(${JSON.stringify(base)})`;
}

function statsView() {
  setNav({ title: t('tab.stats') });
  const st = S.stats();
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const bars = (arr, labels) => {
    const max = Math.max(1, ...arr);
    return `<div class="bars">${arr
      .map(
        (v, i) =>
          `<div class="bar"><div class="bar-v ${v ? '' : 'zero'}" data-h="${(v / max) * 100}"></div><span class="bar-n">${v || ''}</span><span class="bar-l">${labels[i]}</span></div>`,
      )
      .join('')}</div>`;
  };
  const today = dayStart(Date.now());
  const dayLbl = (ts) => new Date(ts).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' });
  const pastLabels = st.perDay.map((_, i) => (i === 13 ? t('day.today') : i % 2 ? '' : dayLbl(today - (13 - i) * DAY)));
  const futLabels = st.forecast.map((_, i) => (i === 0 ? t('day.today') : i === 1 ? t('day.tomorrow') : dayLbl(today + i * DAY)));
  const lists = S.tagProgress().slice(0, 12);
  const tile = (label, value, unit, color) =>
    `<div class="tile"><div class="summary-label">${label}</div><div class="summary-num c-${color}">${value}<small>${unit}</small></div></div>`;

  $app.innerHTML = `
    ${largeTitle(t('tab.stats'))}
    <div class="tiles">
      ${tile(t('stats.streak'), st.streak, t('unit.d'), 'orange')}
      ${tile(t('stats.today'), st.todayReviews, t('unit.answers'), 'green')}
      ${tile(t('stats.time'), st.todayMinutes, t('unit.min'), 'blue')}
      ${tile(t('stats.words'), st.total, t('unit.words'), 'tint')}
    </div>
    <section class="section">
      <div class="section-header">${t('stats.status')}</div>
      <div class="list"><div class="chart-cell">
        <div class="status-stack">${S.STATUSES.filter((k) => st.byStatus[k])
          .map((k) => `<div class="seg-bar s-${k}" data-flex="${st.byStatus[k]}" title="${t(`st.${k}`)}"></div>`)
          .join('')}</div>
        <div class="legend">${S.STATUSES.map((k) => `<span><i class="s-${k}"></i>${t(`st.${k}`)} ${st.byStatus[k]}</span>`).join('')}</div>
      </div></div>
    </section>
    ${
      lists.length
        ? `<section class="section">
            <div class="section-header">${t('stats.lists')}</div>
            <div class="list">${lists
              .map(
                (r) => `<button class="row action-row list-progress" data-tag="${esc(r.tag)}">
                  <div class="row-main">
                    <div class="row-title">${esc(r.tag)}</div>
                    <div class="row-sub">${esc(listProgressText(r))}${r.mature ? ` · ${esc(t('stats.listMastered', { n: r.mature }))}` : ''}</div>
                    <div class="mini-bar"><div class="mini-fill" data-w="${Math.round((r.seen / r.total) * 100)}"></div></div>
                  </div>
                  ${ICON.chev}
                </button>`,
              )
              .join('')}</div>
            <div class="section-footer">${t('stats.listsFoot')}</div>
          </section>`
        : ''
    }
    <section class="section">
      <div class="section-header">${t('stats.retention')}</div>
      <div class="list">
        ${S.STAT_TYPES.filter((ty) => ty === 'meaning' || st.retention[ty] != null)
          .map((ty) => row({ title: t(ty === 'meaning' ? 'stats.recalled' : 'type.article'), detail: `<span class="t-headline strong">${pct(st.retention[ty])}</span>` }))
          .join('')}
      </div>
      <div class="section-footer">${t('stats.retentionFoot', { p: Math.round(state.settings.retention * 100) })}</div>
    </section>
    <section class="section">
      <div class="section-header">${t('stats.forecast')}</div>
      <div class="list"><div class="chart-cell">${bars(st.forecast, futLabels)}</div></div>
    </section>
    <section class="section">
      <div class="section-header">${t('stats.history')}</div>
      <div class="list"><div class="chart-cell">${bars(st.perDay, pastLabels)}</div></div>
    </section>
    ${
      st.hardWords.length
        ? `<section class="section">
            <div class="section-header">${t('stats.hard')}</div>
            <div class="list">${st.hardWords
              .map((w) =>
                row({
                  title: `<span lang="de">${wordHTML(w)}</span>`,
                  sub: [
                    ['meaning', w.cards.meaning?.lapses || 0],
                    ['article', S.articleMisses(w)],
                    ['spell', w.cards.spell?.lapses || 0],
                  ]
                    .filter(([, n]) => n)
                    .map(([ty, n]) => `${t(`type.${ty}`)} ${Number(n)}`)
                    .join(' · '),
                  href: wordLink(w),
                }),
              )
              .join('')}</div>
            <div class="section-footer">${t('stats.hardFoot')}</div>
          </section>`
        : ''
    }`;
  // Tapping a list shows its words.
  $$('.list-progress').forEach((b) =>
    b.addEventListener('click', () => {
      local.set('wordsTag', b.dataset.tag);
      location.hash = '#words';
    }),
  );
}

function syncStatusHTML() {
  if (sync.status === 'off') return row({ title: t('set.syncOffTitle'), sub: t('set.syncOffSub'), icon: icon('cloud', 'gray') });
  const color = { idle: 'green', error: 'red', offline: 'gray' }[sync.status] || 'orange';
  return row({
    title: t(`sync.${sync.status}`),
    sub:
      sync.status === 'error'
        ? `<span class="danger-text">${syncError()}</span>`
        : t('sync.last', { time: relTime(sync.lastSync) }),
    icon: icon('cloud', color),
  });
}

// Chromium browsers offer a real install prompt; elsewhere we show where to find it.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

function installSectionHTML() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const macSafari = !ios && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  let rows;
  if (installPrompt) rows = `<button class="row action" id="installApp">${t('set.install')}</button>`;
  else if (ios) rows = row({ title: 'iPhone / iPad', sub: t('set.homeIos') });
  else if (macSafari) rows = row({ title: 'Mac', sub: t('set.homeMac') });
  else rows = row({ title: t('set.homeOther') });
  return `<section class="section">
      <div class="section-header">${t('set.homeScreen')}</div>
      <div class="list">${rows}</div>
      <div class="section-footer">${ios || macSafari ? t('set.homeFootApple') : t('set.homeFoot')}</div>
    </section>`;
}

function stepperRow(name, label, value, ic, { min = 0, max = 300, step = 5 } = {}) {
  return `<div class="row has-icon">${ic}
    <div class="row-main"><div class="row-title">${label}</div></div>
    <div class="row-detail" id="v-${name}">${value}</div>
    <div class="stepper" data-name="${name}" data-min="${min}" data-max="${max}" data-step="${step}">
      <button type="button" data-d="-1" aria-label="${t('decrease')}">−</button><button type="button" data-d="1" aria-label="${t('increase')}">+</button>
    </div>
  </div>`;
}

// Before connecting a device that already has words: 'merge' (upload them), 'cloud' (drop them
// and use what the library has) or null (cancel). Nothing to ask when the library is empty and
// the words are this device's own.
async function chooseLibrary(token) {
  const here = S.liveWords().length;
  const switching = Boolean(sync.token);
  const { words } = await peek(token);
  if (!switching && words === 0) return 'merge';
  const pick = await dialog({
    message: t(switching ? 'set.switchLibrary' : 'set.mergeLibrary', { n: here, cloud: words ?? '?' }),
    confirm: t('dlg.merge'),
    alt: t('dlg.useCloud'),
  });
  return pick === 2 ? 'cloud' : pick ? 'merge' : null;
}

// 24 characters from an alphabet without look-alikes (about 119 bits). Bytes that would make
// the choice uneven are skipped.
function newToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  while (out.length < 24) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && out.length < 24) out += chars[b % chars.length];
    }
  }
  return out;
}

const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function settingsView() {
  setNav({ title: t('tab.settings') });
  const info = S.storageInfo();
  const s = state.settings;
  const langPref = local.get('lang', 'auto');
  const syncOn = Boolean(sync.token) || local.get('syncOn', false);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const langNames = { zh: '中文', en: 'English' };
  $app.innerHTML = `
    ${largeTitle(t('tab.settings'))}
    <section class="section">
      <div class="section-header">${t('set.daily')}</div>
      <div class="list">
        ${stepperRow('newPerDay', t('set.new'), s.newPerDay, icon('sparkle', 'blue'), { max: 100 })}
      </div>
      <div class="section-footer" id="estimate"></div>
    </section>

    <section class="section">
      <div class="section-header">${t('set.review')}</div>
      <div class="list">
        <label class="row has-icon field">${icon('target', 'indigo')}<span class="grow">${t('set.retention')}</span>
          <select id="retention">
            ${[0.85, 0.9, 0.95]
              .map((v) => `<option value="${v}" ${Math.abs(v - s.retention) < 0.001 ? 'selected' : ''}>${Math.round(v * 100)}%</option>`)
              .join('')}
          </select>${ICON.chev}
        </label>
      </div>
      <div class="section-footer">${t('set.reviewFoot')}</div>
    </section>

    <section class="section">
      <div class="list">
        <label class="row has-icon">${icon('speaker', 'red')}<div class="row-main">${t('set.autoSpeak')}</div><input type="checkbox" class="switch" id="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label>
        <label class="row has-icon">${icon('bell', 'orange')}<div class="row-main">${t('set.sound')}</div><input type="checkbox" class="switch" id="sound" ${s.sound ? 'checked' : ''}></label>
        <label class="row has-icon field">${icon('globe', 'blue')}<span class="grow">${t('set.language')}</span>
          <select id="lang">
            <option value="auto" ${langPref === 'auto' ? 'selected' : ''}>${t('lang.auto')}</option>
            ${LANGS.map((l) => `<option value="${l}" ${langPref === l ? 'selected' : ''}>${langNames[l]}</option>`).join('')}
          </select>${ICON.chev}
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-header">${t('set.sync')}</div>
      <div class="list">
        <label class="row has-icon">${icon('cloud', 'blue')}<div class="row-main">${t('set.syncSwitch')}</div><input type="checkbox" class="switch" id="syncSwitch" ${syncOn ? 'checked' : ''}></label>
        ${
          syncOn
            ? `${sync.token ? `<div id="syncInfo">${syncStatusHTML()}</div>` : ''}
        <form id="tokenForm" class="row has-icon">${icon('key', 'gray')}
          <input class="bare" type="password" id="token" placeholder="${esc(t('set.tokenPh'))}" value="${esc(sync.token)}" autocomplete="off" enterkeyhint="go">
          <button class="btn small" id="tokenBtn"></button>
        </form>
        ${sync.token ? `<button class="row action" id="syncNow">${t('set.syncNow')}</button>` : `<button class="row action" id="genToken">${t('set.genToken')}</button>`}
        ${sync.token && navigator.clipboard ? `<button class="row action" id="copyToken">${t('set.copyToken')}</button>` : ''}`
            : ''
        }
      </div>
      <div class="section-footer">${syncOn ? t('set.syncFoot') : t('set.syncOffFoot')}</div>
    </section>

    <section class="section">
      <div class="section-header">${t('set.backup')}</div>
      <div class="list">
        <button class="row action has-icon" id="exportJson">${icon('up', 'blue')}<div class="row-main strong">${t('set.exportBackup')}</div></button>
        <label class="row action has-icon">${icon('down', 'green')}<div class="row-main strong">${t('set.importBackup')}</div><input type="file" id="importJson" accept="application/json,.json" hidden></label>
      </div>
      <div class="section-footer">${t('set.backupFoot', { time: relTime(state.lastBackup) })}</div>
    </section>

    <section class="section">
      <div class="section-header">${t('set.wordList')}</div>
      <div class="list">
        <label class="row action has-icon">${icon('down', 'green')}<div class="row-main strong">${t('set.importList')}</div><input type="file" id="importList" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values" hidden></label>
        <button class="row action has-icon" id="exportCsv">${icon('up', 'blue')}<div class="row-main strong">${t('set.exportCsv')}</div></button>
        <button class="row action has-icon" id="template">${icon('doc', 'gray')}<div class="row-main strong">${t('add.template')}</div></button>
        ${row({ title: t('help.title'), icon: icon('book', 'gray'), href: '#formats' })}
      </div>
      <div class="section-footer">${t('set.wordListFoot')}</div>
    </section>

    <section class="section">
      <div class="section-header">${t('storage.title')}</div>
      <div class="list">
        ${row({ title: t('storage.words'), detail: t('storage.wordsValue', { n: info.words, d: info.deleted }) })}
        ${row({ title: t('storage.logs'), detail: t('storage.logsValue', { n: info.logs, days: info.days }) })}
        ${row({ title: t('storage.answers'), detail: info.answers })}
        ${row({ title: t('storage.usage'), detail: '<span id="stUsage">…</span>' })}
        ${row({ title: t('storage.persist'), detail: '<span id="stPersist">…</span>' })}
        ${sync.token ? row({ title: t('storage.cloud'), detail: '<span id="stCloud">…</span>' }) : ''}
        <button class="row action" id="compactNow">${t('storage.compact')}</button>
      </div>
      <div class="section-footer" id="stFoot">${t('storage.foot', { keep: S.LOG_DAYS })}</div>
    </section>

    ${standalone ? '' : installSectionHTML()}

    <section class="section">
      <div class="list"><button class="row destructive center" id="wipe">${t(sync.token ? 'set.wipeAll' : 'set.wipe')}</button></div>
      <div class="section-footer center">${t('set.shortcuts')}</div>
    </section>`;

  const showEstimate = () => ($('#estimate').textContent = t('set.estimate', { n: S.estimateMinutes() }));
  showEstimate();
  // Numbers the browser and the server have to tell us arrive a moment later.
  (async () => {
    const usage = await navigator.storage?.estimate?.().catch(() => null);
    if (usage) $('#stUsage') && ($('#stUsage').textContent = t('storage.usageValue', { used: fmtBytes(usage.usage || 0), quota: fmtBytes(usage.quota || 0) }));
    else $('#stUsage') && ($('#stUsage').textContent = '—');
    const kept = await navigator.storage?.persisted?.().catch(() => false);
    if ($('#stPersist')) $('#stPersist').textContent = t(kept ? 'storage.persisted' : 'storage.notPersisted');
    // Without sync, data that the browser may clear is the one thing worth a warning.
    if (!kept && !sync.token && $('#stFoot')) $('#stFoot').textContent += ` ${t('storage.warn')}`;
    if (sync.token && $('#stCloud')) {
      try {
        $('#stCloud').textContent = t('storage.cloudValue', { n: (await peek(sync.token)).words ?? '?', time: relTime(sync.lastSync) });
      } catch {
        $('#stCloud').textContent = '—';
      }
    }
  })();
  $('#compactNow').addEventListener('click', async () => {
    await syncNow();
    const folded = await S.compactLogs();
    await syncNow();
    toast(t(folded ? 'storage.compacted' : 'storage.nothing', { n: folded }), 3500);
    route();
  });

  let saveTimer;
  $$('.stepper').forEach((st) =>
    st.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const { name, min, max, step } = st.dataset;
      const v = Math.min(+max, Math.max(+min, state.settings[name] + +b.dataset.d * +step));
      state.settings[name] = v;
      $(`#v-${name}`).textContent = v;
      showEstimate();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.saveSettings({ [name]: v }), 400);
    }),
  );
  $('#installApp')?.addEventListener('click', async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    route();
  });
  $('#retention').addEventListener('change', (e) => S.saveSettings({ retention: +e.target.value }));
  $('#autoSpeak').addEventListener('change', (e) => S.saveSettings({ autoSpeak: e.target.checked }));
  $('#sound').addEventListener('change', (e) => {
    S.saveSettings({ sound: e.target.checked });
    if (e.target.checked) play('right');
  });
  $('#lang').addEventListener('change', (e) => {
    local.set('lang', e.target.value);
    applyLang();
    renderSync();
    route();
  });

  $('#syncSwitch').addEventListener('change', async (e) => {
    if (e.target.checked) {
      local.set('syncOn', true);
      route();
      $('#token')?.focus();
      return;
    }
    if (sync.token && !(await dialog({ message: t('set.confirmSyncOff'), confirm: t('dlg.turnOff') }))) {
      e.target.checked = true;
      return;
    }
    local.set('syncOn', false);
    if (sync.token) await setToken('');
    route();
  });

  // With an empty field the button pastes from the clipboard, so moving the password to
  // another device is copy on one, paste on the other.
  const tokenInput = $('#token');
  const tokenBtn = $('#tokenBtn');
  const canPaste = Boolean(navigator.clipboard?.readText);
  const updateTokenBtn = () => {
    if (!tokenInput) return;
    const v = tokenInput.value.trim();
    tokenBtn.textContent = !v && canPaste ? t('set.paste') : sync.token ? t('set.update') : t('set.connect');
  };
  updateTokenBtn();
  tokenInput?.addEventListener('input', updateTokenBtn);
  $('#tokenForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!tokenInput.value.trim() && canPaste) {
      try {
        tokenInput.value = (await navigator.clipboard.readText()).trim();
      } catch {
        return;
      }
      if (!tokenInput.value) return;
    }
    // The words on this device are uploaded into whichever library the password opens, so
    // when it already has words, or they came from another password, ask first.
    const next = tokenInput.value.trim();
    let useCloudOnly = false;
    if (next && next !== sync.token && S.liveWords().length) {
      let pick;
      try {
        pick = await chooseLibrary(next);
      } catch (err) {
        return toast(t(`sync.err.${err.code || 'server'}`), 3500);
      }
      if (!pick) return;
      useCloudOnly = pick === 'cloud';
    }
    tokenBtn.disabled = true;
    try {
      if (useCloudOnly) await S.resetLocalLibrary();
      await setToken(tokenInput.value);
      toast(sync.token ? t('set.connected') : t('set.disconnected'));
      route();
    } catch (err) {
      toast(t(`sync.err.${err.code || 'server'}`), 3500);
      tokenBtn.disabled = false;
    }
  });
  $('#genToken')?.addEventListener('click', () => {
    tokenInput.type = 'text';
    tokenInput.value = newToken();
    updateTokenBtn();
    toast(t('set.tokenGenerated'), 5000);
  });
  $('#copyToken')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(sync.token);
    toast(t('set.tokenCopied'), 3500);
  });
  $('#syncNow')?.addEventListener('click', async () => {
    await syncNow();
    toast(sync.status === 'error' ? syncError() : t('sync.idle'));
  });

  $('#exportJson').addEventListener('click', async () => {
    await exportBackup();
    route();
  });
  $('#exportCsv').addEventListener('click', exportWordList);
  $('#template').addEventListener('click', downloadTemplate);
  $('#importList').addEventListener('change', (e) => {
    pendingFile = e.target.files[0] || null;
    if (pendingFile) location.hash = '#add';
  });
  $('#importJson').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await S.importData(JSON.parse(await file.text()));
      toast(t(r.settings ? 'set.importedAll' : 'set.imported', { w: r.words, l: r.logs }));
      route();
    } catch {
      toast(t('set.notBackup'), 3500);
    }
  });
  $('#wipe').addEventListener('click', async () => {
    // With sync on, wiping only this device would be undone at once by the next sync, so the
    // library on the server goes too. That comes first: if the server can't be reached,
    // nothing is deleted.
    const message = sync.token ? t('set.wipeSynced') : t('set.wipeLocal');
    if (!(await dialog({ message, confirm: t('dlg.erase'), destructive: true }))) return;
    const synced = Boolean(sync.token);
    if (synced) {
      try {
        await wipeRemote();
      } catch {
        return toast(t('set.wipeFailed'), 4000);
      }
    }
    // A synced device stays connected: it keeps its password and starts over on the empty library.
    await S.wipeLocal(synced ? ['token', 'epoch'] : []);
    location.reload();
  });
}

async function boot() {
  applyLang();
  // Opening IndexedDB waits silently while another tab holds it; say so instead of a blank page.
  const slow = setTimeout(() => ($app.innerHTML = `<p class="empty">${esc(t('boot.dbSlow'))}</p>`), 4000);
  try {
    await S.load();
  } catch (err) {
    $app.innerHTML = `<p class="empty">${esc(t('boot.dbError', { e: err.message }))}</p>`;
    return;
  } finally {
    clearTimeout(slow);
  }
  await initSync();
  // Without sync nothing else would fold old logs into day summaries; with sync it happens after a sync.
  if (!sync.token) await S.compactLogs();
  onSyncChange(renderSync);
  // Data pulled from another device: refresh in place where the view supports it, and
  // never re-render under someone who is typing.
  onRemoteChange(() => {
    if (refreshView) return refreshView();
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (!typing && ['home', 'stats'].includes(current)) route();
  });
  // The library was erased on another device and this one cleared itself to match.
  onLibraryReset(() => {
    toast(t('sync.wiped'), 6000);
    if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) route();
  });
  renderSync();
  window.addEventListener('hashchange', route);
  route();
  window.addEventListener('offline', () => sync.token && toast(t('sync.offlineToast'), 3500));
  navigator.storage?.persist?.().catch(() => {});
  registerServiceWorker();
  try {
    if (sessionStorage.getItem('vocab-de:updated')) {
      sessionStorage.removeItem('vocab-de:updated');
      toast(t('app.updated'));
    }
  } catch {}
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
  // The first install also fires controllerchange; only a replaced worker means a new release.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    updateReady = true;
    applyUpdateIfIdle();
  });
}

boot();
