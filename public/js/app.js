import * as S from './store.js';
import { state } from './store.js';
import { sync, initSync, setToken, syncNow, onSyncChange, onRemoteChange } from './sync.js';
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
import { dayStart, DAY } from './fsrs.js';
import { t, fmtIvl, locale, detectLang, setLang, getLang, LANGS } from './i18n.js';
import { sampleWords } from './sample.js';
import { itemsFromFile } from './importer.js';
import { speak, ttsAvailable } from './tts.js';

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
function dialog({ message, confirm: okLabel = t('ok'), destructive = false, input = null }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const el = document.createElement('div');
    el.className = 'dialog-backdrop';
    el.innerHTML = `<div class="dialog glass" role="alertdialog" aria-modal="true" aria-labelledby="dlgMsg">
      <p id="dlgMsg">${esc(message)}</p>
      ${input ? `<input class="dialog-input" placeholder="${esc(input.placeholder || '')}" autocomplete="off">` : ''}
      <div class="dialog-buttons">
        <button type="button" data-ok="0">${t('cancel')}</button>
        <button type="button" data-ok="1" class="${destructive ? 'destructive' : 'primary'}">${esc(okLabel)}</button>
      </div>
    </div>`;
    document.body.append(el);
    const field = el.querySelector('.dialog-input');
    const close = (ok) => {
      document.removeEventListener('keydown', onKey, true);
      el.remove();
      prev?.focus?.();
      resolve(input ? (ok ? field.value : null) : ok);
    };
    // Capture phase, so study shortcuts don't fire while the dialog is open.
    const onKey = (e) => {
      if (e.key === 'Tab') {
        // keep focus inside the dialog
        const items = [...el.querySelectorAll('input, button')];
        const i = items.indexOf(document.activeElement);
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      } else if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') close(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) close(b.dataset.ok === '1');
      else if (e.target === el) close(false);
    });
    (field || el.querySelector('[data-ok="1"]')).focus();
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

async function exportBackup() {
  download(`vocab-de-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S.exportData()), 'application/json');
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
  const ms = c.due - Date.now();
  if (ms <= 0) return t('due.now');
  if (c.state === 'review') {
    const days = Math.round((dayStart(c.due) - dayStart(Date.now())) / DAY);
    return days <= 1 ? t('due.tomorrow') : t('due.days', { n: days });
  }
  return t('due.in', { t: fmtIvl(ms) });
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
let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  // collapse the tab bar while scrolling down, expand on the way back up
  if (y < 40 || y < lastY - 6) document.body.classList.remove('tab-min');
  else if (y > lastY + 6 && y > 80) document.body.classList.add('tab-min');
  if (Math.abs(y - lastY) > 6 || y < 40) lastY = y;
  $nav.classList.toggle('scrolled', y > 4);
  const lt = document.querySelector('.large-title h1');
  const showTitle = !$nav.dataset.large || (lt && lt.getBoundingClientRect().bottom < $nav.getBoundingClientRect().bottom);
  $nav.classList.toggle('show-title', Boolean(showTitle));
}
window.addEventListener('scroll', onScroll, { passive: true });
document.querySelector('.tab-capsule').addEventListener('click', (e) => {
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

let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  keyHandler(e);
});

let cleanup = null;
let current = '';
const routes = {
  home: homeView,
  study: () => sessionView({ types: S.CARD_TYPES, mode: 'study' }),
  article: () => sessionView({ types: ['article'], mode: 'article' }),
  words: wordsView,
  add: addView,
  word: editView,
  practice: practiceView,
  stats: statsView,
  settings: settingsView,
};
const TAB_OF = { word: 'words' };

let refreshView = null;

function route() {
  const [name, ...args] = location.hash.slice(1).split('/');
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
const SAFE_TO_RELOAD = ['home', 'words', 'stats', 'settings'];
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
  const reviewTotal = c.due.meaning + c.due.article + c.due.spell;
  const artTotal = c.due.article + c.newLeft.article;
  const parts = S.CARD_TYPES.filter((ty) => c.due[ty]).map((ty) => `${t(`type.${ty}`)} ${c.due[ty]}`);
  const extraNew = c.newLeft.article + c.newLeft.spell;
  if (extraNew) parts.push(t('home.extraNew', { n: extraNew }));

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
              <p class="secondary t-sub">${parts.join(' · ') || t('home.nothingDue')}</p>
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
        ${row({
          title: t('home.articleDrill'),
          sub: artTotal ? t('home.articleDue', { n: artTotal }) : t('home.articleFree'),
          icon: stripesIcon,
          href: '#article',
        })}
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
        ${row({ title: t('home.reviewed'), icon: icon('check', 'green'), detail: t('n.cards', { n: st.todayReviews }) })}
        ${row({ title: t('home.mastered'), icon: icon('target', 'indigo'), detail: `${st.byStatus.mature} / ${st.total}`, href: '#stats' })}
      </div>
    </section>`;

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

function sessionView({ types, mode }) {
  const session = { types, sinceNew: 0, lastWordId: null, done: 0, again: 0, undo: null };
  let alive = true;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function remaining() {
    const c = S.todayCounts();
    const left = types.reduce((sum, ty) => sum + c.answersLeft[ty], 0);
    // Article cards unlocked by today's new nouns only show up in the full session.
    return types.includes('meaning') ? left + c.upcomingAnswers : left;
  }

  function progress() {
    const total = session.done + remaining();
    return { total, pct: total ? Math.round((session.done / total) * 100) : 100 };
  }

  function updateProgress() {
    const { total, pct } = progress();
    const fill = $('.progress-fill');
    if (fill) fill.style.width = `${pct}%`;
    const text = $('.progress-text');
    if (text) text.textContent = `${session.done} / ${total}`;
  }

  function shell(inner, actions, meta = '') {
    // Each card installs its own shortcuts; drop the previous card's so a stray key can't
    // rate a word that is no longer on screen.
    keyHandler = null;
    const { total, pct } = progress();
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar">
          <a href="#home" class="icon-btn glass" aria-label="${t('study.end')}">${ICON.close}</a>
          <div class="progress" aria-label="${t('study.progress')}">
            <div class="progress-track"><div class="progress-fill" data-w="${pct}"></div></div>
            <div class="progress-text">${session.done} / ${total}</div>
          </div>
          <button class="icon-btn glass" id="undoBtn" aria-label="${t('study.undo')}" ${session.undo ? '' : 'disabled'}>${ICON.undo}</button>
        </div>
        <div class="card-area">
          <div class="card">
            <div class="card-meta">${meta}</div>
            ${inner}
          </div>
        </div>
        <div class="study-actions">${actions}</div>
      </div>`;
    $('#undoBtn').addEventListener('click', doUndo);
  }

  function next() {
    if (!alive) return;
    timers.forEach(clearTimeout);
    timers = [];
    const item = S.pickNext(session);
    if (!item) return finish();
    session.lastWordId = item.w.id;
    show(item.w, item.t);
  }

  function show(w, ty) {
    if (ty === 'meaning') meaningCard(w);
    else if (ty === 'article') articleCard(w, { scheduled: true });
    else spellCard(w);
  }

  async function rate(w, ty, g, shownAt, advance = true) {
    const snap = await S.answer(w, ty, g, Date.now() - shownAt);
    // A word forgotten again and again deserves a note or a pause rather than more drilling.
    const lapses = state.words.get(w.id)?.cards[ty]?.lapses || 0;
    if (g === 1 && (lapses === 4 || lapses === 8)) {
      const target = wordLink(w, mode);
      toast(t('study.leech', { w: displayWord(w), n: lapses }), { ms: 6000, action: t('edit'), onAction: () => (location.hash = target) });
    }
    session.undo = { snap, ty };
    session.done++;
    if (g === 1) session.again++;
    if (advance) next();
    else updateProgress();
  }

  async function doUndo() {
    if (!session.undo) return;
    const { snap, ty } = session.undo;
    session.undo = null;
    const w = await S.undo(snap);
    session.done = Math.max(0, session.done - 1);
    session.lastWordId = w.id;
    show(state.words.get(w.id), ty);
  }

  function metaHTML(w, ty) {
    const c = S.getCard(w, ty);
    const tags = [`<span class="tag t-${ty}">${t(`type.${ty}`)}</span>`];
    if (c.state === 'new') tags.push(`<span class="tag new">${t('tag.new')}</span>`);
    else if (c.state === 'relearning') tags.push(`<span class="tag relearn">${t('tag.relearn')}</span>`);
    if (w.tags?.length) tags.push(`<span class="tag">${esc(w.tags[0])}</span>`);
    return tags.join('');
  }

  function ratingButtons(w, ty) {
    const p = S.preview(w, ty);
    const now = Date.now();
    return `<div class="rate">${[1, 2, 3, 4]
      .map((g) => `<button class="r${g}" data-g="${g}"><b>${t(`rate.${g}`)}</b><span>${fmtIvl(Math.max(60_000, p[g].due - now))}</span></button>`)
      .join('')}</div>`;
  }

  function meaningCard(w) {
    const shownAt = Date.now();
    let revealed = false;
    const extra = [posLabel(w.pos), pluralLabel(w), w.forms].filter(Boolean).map(esc).join(' · ');
    shell(
      `<div class="card-body flash" id="flash">
        <div class="word-big${displayWord(w).length > 22 ? ' long' : ''}" lang="de">${wordHTML(w)}</div>
        ${ttsAvailable() ? `<button class="speak" id="speak" aria-label="${t('listen')}">${ICON.speak}</button>` : ''}
        <div class="answer" id="answer" hidden>
          ${extra ? `<div class="sub">${extra}</div>` : ''}
          <div class="zh">${esc(w.zh) || `<span class="tertiary">${t('card.noMeaning')}</span>`}</div>
          ${
            w.example
              ? `<div class="example"><button class="say-example" id="sayExample" lang="de" aria-label="${t('listen')}">${ttsAvailable() ? `${ICON.speaker} ` : ''}${esc(w.example)}</button>${w.exampleZh ? `<div class="secondary">${esc(w.exampleZh)}</div>` : ''}</div>`
              : ''
          }
          ${w.notes ? `<div class="notes">${esc(w.notes)}</div>` : ''}
          <a class="edit-link" href="${wordLink(w, mode)}">${ICON.edit} ${t('edit')}</a>
        </div>
      </div>`,
      `<button class="btn" id="reveal">${t('card.reveal')}<kbd>${t('key.space')}</kbd></button>`,
      metaHTML(w, 'meaning'),
    );
    const say = () => speak(displayWord(w));
    $('#speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    if (state.settings.autoSpeak) say();

    $('#sayExample')?.addEventListener('click', (e) => {
      if (!revealed) return;
      e.stopPropagation();
      speak(w.example);
    });
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      $('#answer').hidden = false;
      $('.study-actions').innerHTML = ratingButtons(w, 'meaning');
      $$('.rate button').forEach((b) => b.addEventListener('click', () => rate(w, 'meaning', +b.dataset.g, shownAt)));
    };
    $('#reveal').addEventListener('click', reveal);
    $('#flash').addEventListener('click', (e) => {
      if (!e.target.closest('a')) reveal();
    });
    keyHandler = (e) => {
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        reveal();
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) rate(w, 'meaning', +e.key, shownAt);
      else if (revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        rate(w, 'meaning', 3, shownAt);
      } else if (e.key === 'r' || e.key === 'p') say();
      else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  function articleCard(w, { scheduled, onDone }) {
    const shownAt = Date.now();
    let answered = false;
    shell(
      `<div class="card-body">
        <div class="drill-word" lang="de">${esc(w.lemma)}</div>
        <div class="drill-zh">${esc(shortMeaning(w.zh))}</div>
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="art-buttons">
        ${ARTICLES.map((a, i) => `<button class="art-btn b-${a}" data-a="${a}" lang="de">${a}<kbd>${i + 1}</kbd></button>`).join('')}
      </div>`,
      scheduled ? metaHTML(w, 'article') : `<span class="tag t-article">${t('drill.free')}</span>` + (drill ? drill.scoreHTML() : ''),
    );

    let go = null;
    const choose = async (a) => {
      if (answered) return;
      answered = true;
      const ms = Date.now() - shownAt;
      const ok = a === w.article;
      const g = ok ? (ms < 2500 ? 3 : 2) : 1;
      $$('.art-btn').forEach((b) => {
        if (b.dataset.a === w.article) b.classList.add('correct');
        else if (b.dataset.a === a) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      const comp = compoundBase(w.lemma, S.liveWords());
      const rule = articleRule(w.lemma);
      let hint = '';
      if (comp) {
        const base = `<span class="g g-${comp.article}" lang="de"><span class="art">${comp.article}</span> ${esc(comp.lemma)}</span>`;
        hint = t('drill.compound', { word: base });
      } else if (rule) {
        hint = esc(t(`rule.${rule.id}`)) + (rule.article !== w.article ? ` <span class="exc">${t('drill.exception')}</span>` : '');
      }
      const pl = pluralLabel(w);
      const exception = !comp && rule && rule.article !== w.article;
      const pause = !ok || exception;
      $('#fb').innerHTML = `
        <div class="fb-badge">${ok ? t('drill.correct') : t('drill.wrong')}</div>
        <div class="fb-word" lang="de">${wordHTML(w)}${pl ? `<span class="secondary"> · ${esc(pl)}</span>` : ''}</div>
        ${hint ? `<div class="fb-hint">${hint}</div>` : ''}
        ${pause ? `<div class="tap-hint">${t('drill.tapToContinue')}</div><a class="edit-link" href="${wordLink(w, mode)}">${ICON.edit} ${t('edit')}</a>` : ''}`;
      $('#fb').className = `feedback ${ok ? 'ok' : 'bad'}`;
      if (state.settings.autoSpeak) speak(displayWord(w));

      if (scheduled) await rate(w, 'article', g, shownAt, false);
      else if (!ok) await S.answer(w, 'article', 1, ms);
      onDone?.(ok);
      let moved = false;
      go = () => {
        if (moved) return;
        moved = true;
        scheduled ? next() : drill.next();
      };
      // Pause on a miss or an exception so it can sink in; otherwise move on by itself.
      if (!pause) later(go, 750);
      keyHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          go();
        } else if (e.key === 'z' || e.key === 'u') doUndo();
      };
    };
    $$('.art-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        answered ? go?.() : choose(b.dataset.a);
      }),
    );
    $('.card').addEventListener('click', (e) => !e.target.closest('a') && answered && go?.());
    keyHandler = (e) => {
      const map = { 1: 'der', 2: 'die', 3: 'das', j: 'der', k: 'die', l: 'das' };
      if (map[e.key]) choose(map[e.key]);
      else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  function spellCard(w) {
    const shownAt = Date.now();
    const needArticle = w.pos === 'noun' && w.article;
    const hint = [posLabel(w.pos), needArticle ? t('spell.withArticle') : '', w.pos === 'verb' ? t('spell.infinitive') : '']
      .filter(Boolean)
      .join(' · ');
    shell(
      `<div class="card-body">
        <div class="big-zh">${esc(w.zh)}</div>
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

    let checked = false;
    const finish = (res) => {
      checked = true;
      input.disabled = true;
      input.blur();
      // nothing typed: the empty field has nothing more to say
      if (!input.value.trim()) $('#spellForm').style.display = 'none';
      const self = res.result === 'self';
      const cls = self ? 'shown' : res.result === 'exact' ? 'ok' : res.result === 'near' ? 'near' : 'bad';
      const fb = $('#fb');
      fb.className = `feedback ${cls}`;
      fb.innerHTML = `
        ${self ? '' : `<div class="fb-badge">${t(`spell.${cls}`)}</div>`}
        <div class="fb-word" lang="de">${wordHTML(w)}</div>
        ${res.why ? `<div class="fb-hint">${t(`spell.why.${res.why}`)}</div>` : ''}
        ${w.example ? `<div class="fb-hint" lang="de">${esc(w.example)}</div>` : ''}
        <a class="edit-link" href="${wordLink(w, mode)}">${ICON.edit} ${t('edit')}</a>`;
      if (state.settings.autoSpeak) speak(displayWord(w));
      let buttons;
      let def;
      if (self) {
        buttons = [
          [1, t('spell.forgot')],
          [3, t('spell.recalled')],
        ];
        def = null;
      } else if (res.result === 'exact') {
        buttons = [
          [2, t('rate.2')],
          [3, t('rate.3')],
          [4, t('rate.4')],
        ];
        def = 3;
      } else if (res.result === 'near') {
        buttons = [
          [1, t('rate.1')],
          [2, t('spell.countRight')],
        ];
        def = 2;
      } else {
        buttons = [
          [1, t('continue')],
          [3, t('spell.iWasRight')],
        ];
        def = 1;
      }
      $('.study-actions').innerHTML = `<div class="rate n${buttons.length}">${buttons
        .map(([g, l]) => `<button class="r${g} ${g === def ? 'def' : ''}" data-g="${g}"><b>${l}</b></button>`)
        .join('')}</div>`;
      $$('.rate button').forEach((b) => b.addEventListener('click', () => rate(w, 'spell', +b.dataset.g, shownAt)));
      keyHandler = (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && def) {
          e.preventDefault();
          rate(w, 'spell', def, shownAt);
        } else if (['1', '2', '3', '4'].includes(e.key) && buttons.some(([g]) => g === +e.key)) {
          rate(w, 'spell', +e.key, shownAt);
        }
      };
    };
    const check = () => {
      if (checked) return;
      const v = input.value.trim();
      if (!v) return input.focus();
      finish(checkSpelling(v, w));
    };
    $('#spellForm').addEventListener('submit', (e) => {
      e.preventDefault();
      check();
    });
    $('#check').addEventListener('click', check);
    // Showing the answer without typing turns the card into a self-rated recall.
    $('#giveUp').addEventListener('click', () => !checked && finish({ result: 'self' }));
  }

  let drill = null;
  function startDrill() {
    const pool = S.drillPool();
    if (!pool.length) return toast(t('drill.empty'));
    const recent = [];
    let right = 0;
    let total = 0;
    let streak = 0;
    drill = {
      scoreHTML: () =>
        total
          ? `<span class="tag">${right}/${total}</span>${streak >= 3 ? `<span class="tag t-article">${t('drill.streak', { n: streak })}</span>` : ''}`
          : '',
      next() {
        if (!alive) return;
        timers.forEach(clearTimeout);
        timers = [];
        const w = S.pickDrill(pool, recent);
        recent.push(w.id);
        if (recent.length > Math.min(15, pool.length - 1)) recent.shift();
        articleCard(w, {
          scheduled: false,
          onDone: (ok) => {
            total++;
            if (ok) {
              right++;
              streak++;
            } else streak = 0;
          },
        });
      },
    };
    drill.next();
  }

  function finish() {
    keyHandler = null;
    const pendingDue = [];
    for (const w of S.liveWords()) {
      for (const ty of types) {
        const c = w.cards[ty];
        if (c && (c.state === 'learning' || c.state === 'relearning')) pendingDue.push(c.due);
      }
    }
    pendingDue.sort((a, b) => a - b);
    const counts = S.todayCounts();
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar"><a href="#home" class="icon-btn glass" aria-label="${t('study.end')}">${ICON.close}</a><span></span><span></span></div>
        <div class="finish">
          <div class="done-circle">${ICON.check}</div>
          <h2>${session.done ? t('finish.title') : t('finish.none')}</h2>
          ${session.done ? `<p class="secondary">${t('finish.summary', { n: session.done, again: session.again })}</p>` : ''}
          ${
            pendingDue.length
              ? `<p class="secondary t-sub">${t('finish.pending', { n: pendingDue.length, t: fmtIvl(pendingDue[0] - Date.now()) })}</p>`
              : ''
          }
          <div class="btns">
            ${
              mode === 'article'
                ? `<button class="btn" id="drill">${t('finish.drill')}</button>
                   <p class="secondary t-foot drill-foot">${t('finish.drillFoot')}</p>`
                : ''
            }
            ${
              mode === 'study' && !counts.total && counts.unseen
                ? `<button class="btn" id="moreNew">${t('home.moreNew', { n: Math.min(10, counts.unseen) })}</button>`
                : ''
            }
            ${mode === 'study' ? `<a class="btn tinted" href="#article">${t('home.articleDrill')}</a>` : ''}
            ${mode === 'article' && counts.total ? `<a class="btn tinted" href="#study">${t('finish.continue', { n: counts.total })}</a>` : ''}
            <a class="btn gray" href="#home">${t('finish.home')}</a>
          </div>
        </div>
      </div>`;
    $('#drill')?.addEventListener('click', startDrill);
    $('#moreNew')?.addEventListener('click', async () => {
      await S.addExtraNew(Math.min(10, counts.unseen));
      next();
    });
    syncNow();
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
      <div class="section-header" id="count"></div>
      <div class="list" id="list"></div>
    </section>
    <div class="select-bar glass" id="selectBar" hidden>
      <button class="sel-text" id="selAll"></button>
      <span class="sel-count" id="selCount"></span>
      <button class="sel-icon" id="selPractice" aria-label="${t('words.practice')}">${ICON.practice}</button>
      <button class="sel-icon" id="selTag" aria-label="${t('words.addTag')}">${ICON.tag}</button>
      <button class="sel-icon" id="selSuspend"></button>
      <button class="sel-icon danger" id="selDelete" aria-label="${t('words.delete')}">${ICON.trash}</button>
    </div>`;
  if ($('#fTag')) $('#fTag').value = tag;
  $('#fStatus').value = status;

  const incomplete = (w) => !w.zh || (w.pos === 'noun' && (!w.article || !w.plural));

  function filter() {
    const ql = q.toLowerCase();
    list = S.liveWords().filter((w) => {
      if (tag !== 'all' && !(w.tags || []).includes(tag)) return false;
      if (status === 'hardArticle') {
        if (!(w.cards.article?.lapses >= 1)) return false;
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
    if (status === 'hardArticle') list.sort((a, b) => b.cards.article.lapses - a.cards.article.lapses);
    else list.sort((a, b) => b.createdAt - a.createdAt);
  }

  function render() {
    filter();
    $('#count').textContent = t('n.words', { n: list.length });
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
    const sus = $('#selSuspend');
    sus.innerHTML = allSuspended ? ICON.play : ICON.pause;
    sus.setAttribute('aria-label', allSuspended ? t('words.resume') : t('words.suspend'));
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
  $('#selPractice').addEventListener('click', () => {
    practiceIds = selectedWords().map((w) => w.id);
    location.hash = '#practice';
  });
  $('#selTag').addEventListener('click', async () => {
    const input = await dialog({
      message: t('words.addTagPrompt'),
      confirm: t('dlg.add'),
      input: { placeholder: t('add.tagsPh') },
    });
    const add = (input || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    if (!add.length) return;
    await S.updateWords(selectedWords(), (w) => (w.tags = [...new Set([...(w.tags || []), ...add])]));
    toast(t('words.tagged', { n: selected.size }));
    route();
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
  const cardRows = S.CARD_TYPES.filter((ty) => w.cards[ty] || S.eligible(w, ty))
    .map((ty) => {
      const c = S.getCard(w, ty);
      const sub = c.state === 'new' ? '' : t('edit.progressSub', { s: c.s.toFixed(1), l: c.lapses || 0 });
      return row({ title: t(`type.${ty}`), sub, detail: dueText(c) });
    })
    .join('');
  const noAutoFix = 'autocapitalize="off" autocorrect="off" spellcheck="false"';

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
          <label class="row field"><span>${t('edit.plural')}</span><input name="plural" value="${esc(w.plural)}" placeholder="${esc(t('edit.pluralPh'))}" lang="de" ${noAutoFix}></label>
          <label class="row field"><span>${t('edit.pos')}</span><select name="pos"><option value="">${t('edit.posUnset')}</option>${options(POS, 'pos', w.pos)}</select>${ICON.chev}</label>
          <label class="row field"><span>${t('edit.forms')}</span><input name="forms" value="${esc(w.forms)}" placeholder="${esc(t('edit.formsPh'))}" lang="de" ${noAutoFix}></label>
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
    <section class="section">
      <div class="section-header">${t('edit.progress')}</div>
      <div class="list">${cardRows}</div>
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
    toast(t('edit.deleted'));
    location.hash = back.href;
  });
  return flush;
}

const PREVIEW_LIMIT = 200;

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
  $app.innerHTML = `
    ${largeTitle(t('add.title'))}
    <section class="section">
      <div class="list">
        <div class="row">
          <textarea class="bare lines-input" id="lines" rows="7" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(t('add.ph'))}"></textarea>
        </div>
        <div class="row file-row" id="fileRow" hidden>
          <span class="ic gray">${ICON.doc}</span>
          <div class="row-main"><div class="row-title" id="fileName"></div></div>
          <button class="x" id="clearFile" aria-label="${t('add.clearFile')}">✕</button>
        </div>
        <label class="row action has-icon" id="pickFile">${icon('down', 'blue')}<div class="row-main">${t('add.fromFile')}</div>
          <input type="file" id="fileInput" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values" hidden>
        </label>
      </div>
      <div class="section-footer">${esc(t('add.foot'))}</div>
    </section>
    <section class="section">
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
    <div id="preview"></div>`;

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

  function parse() {
    const fromFile = file ? file.items.filter((it) => !removed.has(it.raw)).map((it) => ({ ...it, fromFile: true })) : [];
    items = [...fromFile, ...lines.value.split(/\r?\n/).map(parseLine).filter(Boolean)];
    const seen = new Set();
    for (const it of items) {
      Object.assign(it, fills.get(it.raw));
      const key = `${it.article}|${it.lemma.toLowerCase()}`;
      it.dup = Boolean(S.findDuplicate(it.lemma, it.article)) || seen.has(key);
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
      const { items: rows } = await itemsFromFile(f);
      if (!rows.length) return toast(t('add.fileEmpty'), 3500);
      file = { name: f.name, items: rows };
      removed.clear();
      $('#fileRow').hidden = false;
      $('#fileName').textContent = t('add.fileLoaded', { name: f.name, n: rows.length });
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

  const headerText = () => {
    const fresh = items.filter((i) => !i.dup).length;
    const dup = items.length - fresh;
    const miss = items.filter((x) => !x.dup && isIncomplete(x)).length;
    return [t('add.new', { n: fresh }), dup ? t('add.dup', { n: dup }) : '', miss ? t('add.missing', { n: miss }) : '']
      .filter(Boolean)
      .join(' · ');
  };

  function renderPreview() {
    const box = $('#preview');
    if (!items.length) {
      box.innerHTML = '';
      return;
    }
    const fresh = items.filter((i) => !i.dup);
    const hidden = items.length - PREVIEW_LIMIT;
    box.innerHTML = `
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
              if (it.dup) body = `<div class="row-sub">${t('add.exists')}</div>`;
              else {
                if (it.pos === 'noun' && !it.article) {
                  body += `<div class="pv-art">${ARTICLES.map((a) => `<button class="b-${a}" data-i="${i}" data-a="${a}" lang="de">${a}</button>`).join('')}</div>`;
                }
                body += fills.get(it.raw)?.zh !== undefined || !it.zh
                  ? `<input class="pv-zh" data-i="${i}" value="${esc(it.zh)}" placeholder="${esc(t('edit.meaning'))}" autocomplete="off" enterkeyhint="next">`
                  : `<div class="row-sub">${esc(it.zh)}</div>`;
              }
              return `<div class="row pv ${it.dup ? 'dup' : ''}">
                <div class="row-main"><div lang="de">${kind}${wordHTML(it)}${pl}${forms}</div>${body}</div>
                <button class="x" data-i="${i}" aria-label="${t('add.remove')}">✕</button>
              </div>`;
            })
            .join('')}
          ${hidden > 0 ? `<div class="row"><div class="row-main secondary">${t('add.moreRows', { n: hidden })}</div></div>` : ''}
        </div>
        <div class="section-footer">${esc(t('add.previewFoot'))}</div>
      </section>
      <section class="section">
        <button class="btn" id="import" ${fresh.length ? '' : 'disabled'}>${t('add.import', { n: fresh.length })}</button>
      </section>`;
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
    $('#import', box).addEventListener('click', doImport);
  }

  async function doImport() {
    const tags = tagList();
    const base = Date.now();
    const words = items
      .filter((i) => !i.dup)
      .map(({ fromFile, dup, raw, ...i }) => S.makeWord({ ...i, tags: [...new Set([...(i.tags || []), ...tags])], batch: base }));
    // keep the pasted order
    words.forEach((w, i) => (w.createdAt = base + i));
    await S.addWords(words);
    toast(t('add.imported', { n: words.length }));
    items = [];
    fills.clear();
    file = null;
    $('#fileRow').hidden = true;
    lines.value = '';
    renderPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (pendingAdd) {
    lines.value = pendingAdd;
    pendingAdd = '';
    parse();
    $('.pv-zh')?.focus();
  }
  return () => {
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('dragleave', onDragLeave);
    document.removeEventListener('drop', onDrop);
    document.body.classList.remove('dropping');
  };
}

// Free practice over chosen words. It never touches the review schedule.
let practiceIds = [];

function practiceView() {
  let queue = practiceIds.map((id) => state.words.get(id)).filter((w) => w && !w.deleted);
  if (!queue.length) {
    location.hash = '#words';
    return;
  }
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const total = queue.length;
  let known = 0;
  let again = 0;

  function show() {
    const w = queue[0];
    if (!w) return finish();
    let revealed = false;
    const pct = Math.round((known / total) * 100);
    const extra = [posLabel(w.pos), pluralLabel(w), w.forms].filter(Boolean).map(esc).join(' · ');
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar">
          <a href="#words" class="icon-btn glass" aria-label="${t('study.end')}">${ICON.close}</a>
          <div class="progress" aria-label="${t('study.progress')}">
            <div class="progress-track"><div class="progress-fill" data-w="${pct}"></div></div>
            <div class="progress-text">${known} / ${total}</div>
          </div>
          <span></span>
        </div>
        <div class="card-area">
          <div class="card">
            <div class="card-meta"><span class="tag t-meaning">${t('practice.tag')}</span></div>
            <div class="card-body flash" id="flash">
              <div class="word-big${displayWord(w).length > 22 ? ' long' : ''}" lang="de">${wordHTML(w)}</div>
              ${ttsAvailable() ? `<button class="speak" id="speak" aria-label="${t('listen')}">${ICON.speak}</button>` : ''}
              <div class="answer" id="answer" hidden>
                ${extra ? `<div class="sub">${extra}</div>` : ''}
                <div class="zh">${esc(w.zh) || `<span class="tertiary">${t('card.noMeaning')}</span>`}</div>
                ${w.example ? `<div class="example"><div lang="de">${esc(w.example)}</div>${w.exampleZh ? `<div class="secondary">${esc(w.exampleZh)}</div>` : ''}</div>` : ''}
              </div>
            </div>
          </div>
        </div>
        <div class="study-actions"><button class="btn" id="reveal">${t('card.reveal')}<kbd>${t('key.space')}</kbd></button></div>
      </div>`;
    const say = () => speak(displayWord(w));
    $('#speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    if (state.settings.autoSpeak) say();
    const answer = (ok) => {
      queue.shift();
      if (ok) known++;
      else {
        again++;
        // bring it back a few cards later
        queue.splice(Math.min(3, queue.length), 0, w);
      }
      show();
    };
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      $('#answer').hidden = false;
      $('.study-actions').innerHTML = `<div class="rate n2">
        <button class="r1" id="notYet"><b>${t('practice.again')}</b></button>
        <button class="r3 def" id="gotIt"><b>${t('practice.know')}</b></button>
      </div>`;
      $('#notYet').addEventListener('click', () => answer(false));
      $('#gotIt').addEventListener('click', () => answer(true));
    };
    $('#reveal').addEventListener('click', reveal);
    $('#flash').addEventListener('click', reveal);
    keyHandler = (e) => {
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        reveal();
      } else if (revealed && e.key === '1') answer(false);
      else if (revealed && (e.key === '2' || e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        answer(true);
      } else if (e.key === 'r' || e.key === 'p') say();
    };
  }

  function finish() {
    keyHandler = null;
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar"><a href="#words" class="icon-btn glass" aria-label="${t('study.end')}">${ICON.close}</a><span></span><span></span></div>
        <div class="finish">
          <div class="done-circle">${ICON.check}</div>
          <h2>${t('practice.doneTitle')}</h2>
          <p class="secondary">${t('practice.doneBody', { n: total, again })}</p>
          <p class="secondary t-foot">${t('practice.foot')}</p>
          <div class="btns">
            <button class="btn" id="again">${t('practice.restart')}</button>
            <a class="btn gray" href="#words">${t('practice.back')}</a>
          </div>
        </div>
      </div>`;
    $('#again').addEventListener('click', () => route());
  }

  show();
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
  const tile = (label, value, unit, color) =>
    `<div class="tile"><div class="summary-label">${label}</div><div class="summary-num c-${color}">${value}<small>${unit}</small></div></div>`;

  $app.innerHTML = `
    ${largeTitle(t('tab.stats'))}
    <div class="tiles">
      ${tile(t('stats.streak'), st.streak, t('unit.d'), 'orange')}
      ${tile(t('stats.today'), st.todayReviews, t('unit.cards'), 'green')}
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
    <section class="section">
      <div class="section-header">${t('stats.retention')}</div>
      <div class="list">
        ${S.CARD_TYPES.map((ty) =>
          row({ title: t(`type.${ty}`), detail: `<span class="t-headline strong">${pct(st.retention[ty])}</span>` }),
        ).join('')}
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
                  sub: S.CARD_TYPES.filter((ty) => w.cards[ty]?.lapses)
                    .map((ty) => `${t(`type.${ty}`)} ${Number(w.cards[ty].lapses) || 0}`)
                    .join(' · '),
                  href: wordLink(w),
                }),
              )
              .join('')}</div>
            <div class="section-footer">${t('stats.hardFoot')}</div>
          </section>`
        : ''
    }`;
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

function settingsView() {
  setNav({ title: t('tab.settings') });
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
        <label class="row has-icon">${icon('pencil', 'green')}<div class="row-main">${t('set.spell')}</div><input type="checkbox" class="switch" id="spell" ${s.spell ? 'checked' : ''}></label>
        <label class="row has-icon">${icon('speaker', 'red')}<div class="row-main">${t('set.autoSpeak')}</div><input type="checkbox" class="switch" id="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label>
      </div>
      <div class="section-footer">${t('set.reviewFoot')}</div>
    </section>

    <section class="section">
      <div class="list">
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
        ${sync.token ? `<button class="row action" id="syncNow">${t('set.syncNow')}</button>` : ''}
        ${sync.token && navigator.clipboard ? `<button class="row action" id="copyToken">${t('set.copyToken')}</button>` : ''}`
            : ''
        }
      </div>
      <div class="section-footer">${syncOn ? t('set.syncFoot') : t('set.syncOffFoot')}</div>
    </section>

    ${standalone ? '' : installSectionHTML()}

    <section class="section">
      <div class="section-header">${t('set.data')}</div>
      <div class="list">
        <button class="row action has-icon" id="exportJson">${icon('up', 'blue')}<div class="row-main strong">${t('set.exportBackup')}</div></button>
        <label class="row action has-icon">${icon('down', 'green')}<div class="row-main strong">${t('set.importBackup')}</div><input type="file" id="importJson" accept="application/json,.json" hidden></label>
        <button class="row action has-icon" id="exportCsv">${icon('book', 'gray')}<div class="row-main strong">${t('set.exportCsv')}</div></button>
      </div>
      <div class="section-footer">${t('set.lastBackup', { time: relTime(state.lastBackup) })}</div>
    </section>
    <section class="section">
      <div class="list"><button class="row destructive center" id="wipe">${t('set.wipe')}</button></div>
      <div class="section-footer center">${t('set.shortcuts')}</div>
    </section>`;

  const showEstimate = () => ($('#estimate').textContent = t('set.estimate', { n: S.estimateMinutes() }));
  showEstimate();
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
  $('#spell').addEventListener('change', async (e) => {
    await S.saveSettings({ spell: e.target.checked });
    showEstimate();
  });
  $('#autoSpeak').addEventListener('change', (e) => S.saveSettings({ autoSpeak: e.target.checked }));
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
    tokenBtn.disabled = true;
    try {
      await setToken(tokenInput.value);
      toast(sync.token ? t('set.connected') : t('set.disconnected'));
      route();
    } catch (err) {
      toast(t(`sync.err.${err.code || 'server'}`), 3500);
      tokenBtn.disabled = false;
    }
  });
  $('#copyToken')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(sync.token);
    toast(t('set.tokenCopied'), 3500);
  });
  $('#syncNow')?.addEventListener('click', async () => {
    await syncNow();
    toast(sync.status === 'error' ? syncError() : t('sync.idle'));
  });

  const stamp = new Date().toISOString().slice(0, 10);
  $('#exportJson').addEventListener('click', async () => {
    await exportBackup();
    route();
  });
  $('#exportCsv').addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['article', 'lemma', 'plural', 'pos', 'forms', 'meaning', 'example', 'example_translation', 'tags', 'status']];
    for (const w of S.liveWords()) {
      rows.push([w.article, w.lemma, w.plural, w.pos, w.forms, w.zh, w.example, w.exampleZh, (w.tags || []).join(';'), S.wordStatus(w)]);
    }
    download(`vocab-de-${stamp}.csv`, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv');
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
    const message = sync.token ? t('set.wipeSynced') : t('set.wipeLocal');
    if (!(await dialog({ message, confirm: t('dlg.erase'), destructive: true }))) return;
    await S.wipeLocal();
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
  onSyncChange(renderSync);
  // Data pulled from another device: refresh in place where the view supports it, and
  // never re-render under someone who is typing.
  onRemoteChange(() => {
    if (refreshView) return refreshView();
    const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (!typing && ['home', 'stats'].includes(current)) route();
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
