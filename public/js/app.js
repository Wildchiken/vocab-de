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
import { formatIvl, dayStart, DAY } from './fsrs.js';
import { speak, ttsAvailable } from './tts.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('navbar');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, root = $app) => root.querySelector(sel);
const $$ = (sel, root = $app) => [...root.querySelectorAll(sel)];

const POS_LABEL = {
  noun: '名词',
  verb: '动词',
  adj: '形容词',
  adv: '副词',
  prep: '介词',
  conj: '连词',
  phrase: '短语',
  other: '其他',
};

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
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11.5A1.5 1.5 0 0 1 18 5.5V20H6.5A1.5 1.5 0 0 1 5 18.5z" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M5 19.5h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.5 1.3-4 2.3-5 .2 1.8 1 2.8 2 3.2C10.3 9 11 6 12 3z" fill="currentColor"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l.8-3.6L15.6 5.6a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1L8.6 18.2z" fill="currentColor"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 12h8M17 12v3M20 12v2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

const stripesIcon = '<span class="ic stripes"><i style="background:#0a84ff"></i><i style="background:#ff453a"></i><i style="background:#30d158"></i></span>';
const icon = (name, color) => `<span class="ic ${color}">${ICON[name]}</span>`;

// 小工具
function wordHTML(w) {
  if (w.pos === 'noun' && ARTICLES.includes(w.article)) {
    return `<span class="g g-${w.article}"><span class="art">${w.article}</span> <span class="lemma">${esc(w.lemma)}</span></span>`;
  }
  return `<span class="g"><span class="lemma">${esc(w.lemma)}</span></span>`;
}

const shortZh = (zh) => (zh || '').split(/[；;]/).slice(0, 2).join('；');

function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
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

function relTime(ts) {
  if (!ts) return '从未';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dueText(c) {
  if (!c || c.state === 'new') return '未学';
  const ms = c.due - Date.now();
  if (ms <= 0) return '已到期';
  if (c.state === 'review') {
    const days = Math.round((dayStart(c.due) - dayStart(Date.now())) / DAY);
    return days <= 1 ? '明天' : `${days} 天后`;
  }
  return `${formatIvl(ms)}后`;
}

// 分组列表的一行
function row({ title, sub = '', detail = '', href, icon: ic = '', cls = '', attrs = '', chevron = Boolean(href) }) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="row ${ic ? 'has-icon' : ''} ${cls}" ${href ? `href="${href}"` : ''} ${attrs}>
    ${ic}
    <div class="row-main"><div class="row-title">${title}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
    ${detail !== '' ? `<div class="row-detail">${detail}</div>` : ''}
    ${chevron ? ICON.chev : ''}
  </${tag}>`;
}

const largeTitle = (title, kicker = '') =>
  `<header class="large-title">${kicker ? `<span class="kicker">${kicker}</span>` : ''}<h1>${title}</h1></header>`;

// 导航栏：大标题滚走后显示小标题
function setNav({ title = '', back = null, extra = '', large = true } = {}) {
  document.getElementById('navTitle').textContent = title;
  document.getElementById('navLeft').innerHTML = back
    ? `<a class="nav-back glass" href="${back.href}" aria-label="返回${esc(back.label)}">${ICON.back}<span>${esc(back.label)}</span></a>`
    : '';
  document.getElementById('navExtra').innerHTML = extra;
  $nav.dataset.large = large ? '1' : '';
  // 页面内容渲染后 route() 会再算一次；这里先按大标题可见处理，避免小标题闪一下
  $nav.classList.toggle('show-title', !large);
}
let lastY = 0;
function onScroll() {
  const y = window.scrollY;
  // 往下滚收起标签栏，往上滚展开
  if (y < 40 || y < lastY - 6) document.body.classList.remove('tab-min');
  else if (y > lastY + 6 && y > 80) document.body.classList.add('tab-min');
  if (Math.abs(y - lastY) > 6 || y < 40) lastY = y;
  $nav.classList.toggle('scrolled', y > 4);
  const lt = document.querySelector('.large-title h1');
  const showTitle = !$nav.dataset.large || (lt && lt.getBoundingClientRect().bottom < $nav.getBoundingClientRect().bottom);
  $nav.classList.toggle('show-title', Boolean(showTitle));
}
window.addEventListener('scroll', onScroll, { passive: true });
// 收起状态下点标签栏先展开
document.querySelector('.tab-capsule').addEventListener('click', (e) => {
  if (!document.body.classList.contains('tab-min') || matchMedia('(min-width: 1000px)').matches) return;
  e.preventDefault();
  document.body.classList.remove('tab-min');
});

// 多行输入框随内容长高（Safari 还不支持 field-sizing）
function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight}px`;
}
document.addEventListener('input', (e) => e.target.matches?.('.field textarea') && autoGrow(e.target));

// 键盘
let keyHandler = null;
document.addEventListener('keydown', (e) => {
  if (!keyHandler || e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  keyHandler(e);
});

// 路由
let cleanup = null;
let current = '';
const routes = {
  home: homeView,
  study: () => sessionView({ types: S.CARD_TYPES, mode: 'study' }),
  article: () => sessionView({ types: ['article'], mode: 'article' }),
  words: wordsView,
  add: addView,
  word: editView,
  stats: statsView,
  settings: settingsView,
};
const TAB_OF = { word: 'words' };

function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  cleanup?.();
  cleanup = null;
  keyHandler = null;
  current = routes[name] ? name : 'home';
  document.body.dataset.view = current;
  const tab = TAB_OF[current] || current;
  for (const a of document.querySelectorAll('.tabbar a')) {
    a.classList.toggle('active', a.getAttribute('href') === `#${tab}`);
  }
  window.scrollTo(0, 0);
  lastY = 0;
  document.body.classList.remove('tab-min');
  cleanup = routes[current](arg ? decodeURIComponent(arg) : undefined) || null;
  onScroll();
}

// 同步状态
const SYNC_LABEL = {
  off: '未开启同步',
  idle: '已同步',
  syncing: '正在同步',
  pending: '等待同步',
  error: '同步失败',
  offline: '离线',
};
function renderSync() {
  const btn = document.getElementById('syncBtn');
  btn.dataset.status = sync.status;
  btn.setAttribute('aria-label', SYNC_LABEL[sync.status]);
  btn.title = sync.error || `${SYNC_LABEL[sync.status]} · 上次同步 ${relTime(sync.lastSync)}`;
  const info = document.getElementById('syncInfo');
  if (info) info.innerHTML = syncStatusHTML();
}
document.getElementById('syncBtn').addEventListener('click', async () => {
  if (sync.status === 'off') {
    location.hash = '#settings';
    return;
  }
  await syncNow();
  toast(sync.status === 'error' ? sync.error || '同步失败' : sync.status === 'offline' ? '离线，联网后自动同步' : '已同步');
});

// 今天
let pendingAdd = '';

function todayKicker() {
  return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
}

function homeView() {
  setNav({ title: '今天' });
  const words = S.liveWords();
  if (!words.length) {
    $app.innerHTML = `
      ${largeTitle('今天', todayKicker())}
      <section class="section welcome">
        <div class="summary done">
          <div class="done-circle" style="background:var(--tint)">${ICON.book}</div>
          <h2>开始建你的词库</h2>
          <p class="secondary t-sub">把考试词表、课本词汇或者平时遇到的生词贴进来，一行一个。</p>
        </div>
      </section>
      <section class="section">
        <div class="section-header">支持的格式</div>
        <div class="list"><pre class="sample">der Tisch, -e 桌子
die Mutter, ¨ 母亲
gehen, ging, ist gegangen 走
Zeitung</pre></div>
        <div class="section-footer">复数写成 -e、¨-er、- 都能识别。没写中文或冠词的，识别后可以直接补上。</div>
      </section>
      <section class="section"><a class="btn" href="#add">导入单词</a></section>
      ${
        sync.status === 'off'
          ? `<section class="section"><div class="list">${row({ title: '在 iPhone、iPad、Mac 之间同步', icon: icon('cloud', 'blue'), href: '#settings' })}</div></section>`
          : ''
      }`;
    return;
  }

  const c = S.todayCounts();
  const st = S.stats();
  const reviewTotal = c.due.meaning + c.due.article + c.due.spell;
  const artTotal = c.due.article + c.newLeft.article;
  const parts = [];
  if (c.due.meaning) parts.push(`释义 ${c.due.meaning}`);
  if (c.due.article) parts.push(`冠词 ${c.due.article}`);
  if (c.due.spell) parts.push(`拼写 ${c.due.spell}`);
  const extraNew = c.newLeft.article + c.newLeft.spell;
  if (extraNew) parts.push(`新冠词/拼写卡 ${extraNew}`);

  $app.innerHTML = `
    ${largeTitle('今天', todayKicker())}
    <section class="section">
      ${
        c.total
          ? `<div class="summary">
              <div class="summary-nums">
                <div><div class="summary-label">待复习</div><div class="summary-num c-tint">${reviewTotal}</div></div>
                <div><div class="summary-label">新词</div><div class="summary-num c-blue">${c.newLeft.meaning}</div></div>
              </div>
              <p class="secondary t-sub">${parts.join(' · ') || '没有到期的复习'}</p>
              <a class="btn" href="#study">开始学习<kbd>↵</kbd></a>
            </div>`
          : `<div class="summary done">
              <div class="done-circle">${ICON.check}</div>
              <h2>今天的任务完成了</h2>
              <p class="secondary t-sub">明天预计复习 ${st.forecast[1]} 张</p>
            </div>`
      }
    </section>

    <section class="section">
      <div class="list">
        ${row({ title: '冠词快练', sub: artTotal ? `${artTotal} 张到期或新卡` : '可以自由练习', icon: stripesIcon, href: '#article' })}
      </div>
    </section>

    <section class="section">
      <div class="section-header">遇到生词</div>
      <form class="list quick-add" id="quickAdd">
        <div class="row">
          <input class="bare" id="qa" placeholder="如 die Haltestelle 或 aufräumen" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" lang="de" enterkeyhint="done">
          <button class="btn small">添加</button>
        </div>
      </form>
    </section>

    <section class="section">
      <div class="section-header">概况</div>
      <div class="list">
        ${row({ title: '连续学习', icon: icon('flame', 'orange'), detail: `${st.streak} 天` })}
        ${row({ title: '今日已做', icon: icon('check', 'green'), detail: `${st.todayReviews} 张` })}
        ${row({ title: '已掌握', icon: icon('target', 'indigo'), detail: `${st.byStatus.mature} / ${st.total}`, href: '#stats' })}
      </div>
    </section>`;

  $('#quickAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#qa').value.trim();
    if (!v) return;
    pendingAdd = v;
    local.set('addSource', 'daily');
    location.hash = '#add';
  });
  keyHandler = (e) => {
    if (e.key === 'Enter' && c.total) location.hash = '#study';
  };
}

// 学习会话
function sessionView({ types, mode }) {
  const session = { types, sinceNew: 0, lastWordId: null, done: 0, again: 0, undo: null };
  let alive = true;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function remaining() {
    const c = S.todayCounts();
    return types.reduce((s, t) => s + c.due[t] + c.newLeft[t], 0);
  }

  function shell(inner, actions, meta = '') {
    const left = remaining();
    const total = session.done + left;
    const pct = total ? Math.round((session.done / total) * 100) : 100;
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar">
          <a href="#home" class="icon-btn glass" aria-label="结束">${ICON.close}</a>
          <div class="progress" aria-label="进度">
            <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="progress-text">${session.done} / ${total}</div>
          </div>
          <button class="icon-btn glass" id="undoBtn" aria-label="撤销" ${session.undo ? '' : 'disabled'}>${ICON.undo}</button>
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

  function show(w, t) {
    if (t === 'meaning') meaningCard(w);
    else if (t === 'article') articleCard(w, { scheduled: true });
    else spellCard(w);
  }

  async function rate(w, t, g, shownAt, advance = true) {
    const snap = await S.answer(w, t, g, Date.now() - shownAt);
    session.undo = { snap, t };
    session.done++;
    if (g === 1) session.again++;
    if (advance) next();
  }

  async function doUndo() {
    if (!session.undo) return;
    const { snap, t } = session.undo;
    session.undo = null;
    const w = await S.undo(snap);
    session.done = Math.max(0, session.done - 1);
    session.lastWordId = w.id;
    show(state.words.get(w.id), t);
  }

  function metaHTML(w, t) {
    const c = S.getCard(w, t);
    const tags = [`<span class="tag t-${t}">${S.TYPE_LABEL[t]}</span>`];
    if (c.state === 'new') tags.push('<span class="tag new">新</span>');
    else if (c.state === 'relearning') tags.push('<span class="tag relearn">重学</span>');
    if (w.tags?.length) tags.push(`<span class="tag">${esc(w.tags[0])}</span>`);
    return tags.join('');
  }

  function ratingButtons(w, t) {
    const p = S.preview(w, t);
    const now = Date.now();
    const lbl = (g) => formatIvl(Math.max(60_000, p[g].due - now));
    return `<div class="rate">
      <button class="r1" data-g="1"><b>重来</b><span>${lbl(1)}</span></button>
      <button class="r2" data-g="2"><b>困难</b><span>${lbl(2)}</span></button>
      <button class="r3" data-g="3"><b>良好</b><span>${lbl(3)}</span></button>
      <button class="r4" data-g="4"><b>简单</b><span>${lbl(4)}</span></button>
    </div>`;
  }

  // 释义卡：看德语想中文
  function meaningCard(w) {
    const shownAt = Date.now();
    let revealed = false;
    const extra = [POS_LABEL[w.pos], pluralText(w), w.forms].filter(Boolean).map(esc).join(' · ');
    shell(
      `<div class="card-body flash" id="flash">
        <div class="word-big" lang="de">${wordHTML(w)}</div>
        ${ttsAvailable() ? `<button class="speak" id="speak" aria-label="朗读">${ICON.speak}</button>` : ''}
        <div class="answer" id="answer" hidden>
          ${extra ? `<div class="sub">${extra}</div>` : ''}
          <div class="zh">${esc(w.zh) || '<span class="tertiary">还没有释义</span>'}</div>
          ${w.example ? `<div class="example"><div lang="de">${esc(w.example)}</div>${w.exampleZh ? `<div class="secondary">${esc(w.exampleZh)}</div>` : ''}</div>` : ''}
          ${w.notes ? `<div class="notes">${esc(w.notes)}</div>` : ''}
          <a class="edit-link" href="#word/${encodeURIComponent(w.id)}">${ICON.edit} 编辑</a>
        </div>
      </div>`,
      `<button class="btn" id="reveal">显示答案<kbd>空格</kbd></button>`,
      metaHTML(w, 'meaning'),
    );
    const say = () => speak(displayWord(w));
    $('#speak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      say();
    });
    if (state.settings.autoSpeak) say();

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

  // 冠词卡
  function articleCard(w, { scheduled, onDone }) {
    const shownAt = Date.now();
    let answered = false;
    shell(
      `<div class="card-body">
        <div class="drill-word" lang="de">${esc(w.lemma)}</div>
        <div class="drill-zh">${esc(shortZh(w.zh))}</div>
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="art-buttons">
        ${ARTICLES.map((a, i) => `<button class="art-btn b-${a}" data-a="${a}">${a}<kbd>${i + 1}</kbd></button>`).join('')}
      </div>`,
      scheduled ? metaHTML(w, 'article') : '<span class="tag t-article">自由练习</span>' + (drill ? drill.scoreHTML() : ''),
    );

    const choose = async (a) => {
      if (answered) return;
      answered = true;
      const ms = Date.now() - shownAt;
      const ok = a === w.article;
      const g = ok ? (ms < 2500 ? 3 : 2) : 1;
      $$('.art-btn').forEach((b) => {
        b.disabled = true;
        if (b.dataset.a === w.article) b.classList.add('correct');
        else if (b.dataset.a === a) b.classList.add('wrong');
      });
      const comp = compoundBase(w.lemma, S.liveWords());
      const rule = articleRule(w.lemma);
      let hint = '';
      if (comp) {
        hint = `复合词，冠词跟最后一部分：<span class="g g-${comp.article}"><span class="art">${comp.article}</span> ${esc(comp.lemma)}</span>`;
      } else if (rule) {
        hint = esc(rule.text) + (rule.article !== w.article ? ' <span class="exc">这个词是例外</span>' : '');
      }
      const pl = pluralText(w);
      $('#fb').innerHTML = `
        <div class="fb-badge">${ok ? '答对了' : '答错了'}</div>
        <div class="fb-word">${wordHTML(w)}${pl ? `<span class="secondary"> · ${esc(pl)}</span>` : ''}</div>
        ${hint ? `<div class="fb-hint">${hint}</div>` : ''}`;
      $('#fb').className = `feedback ${ok ? 'ok' : 'bad'}`;
      if (state.settings.autoSpeak) speak(displayWord(w));

      if (scheduled) await rate(w, 'article', g, shownAt, false);
      else if (!ok) await S.answer(w, 'article', 1, ms);
      onDone?.(ok);
      const go = () => (scheduled ? next() : drill.next());
      const exception = !comp && rule && rule.article !== w.article;
      // 答错或遇到例外时停下来，让人看清楚；答对就自动下一张
      if (ok && !exception) {
        later(go, 750);
        keyHandler = (e) => (e.key === ' ' || e.key === 'Enter') && go();
      } else {
        later(() => {
          $('.study-actions').innerHTML = `<button class="btn" id="cont">继续<kbd>空格</kbd></button>`;
          $('#cont').addEventListener('click', go);
        }, 350);
        keyHandler = (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            go();
          } else if (e.key === 'z' || e.key === 'u') doUndo();
        };
      }
    };
    $$('.art-btn').forEach((b) => b.addEventListener('click', () => choose(b.dataset.a)));
    keyHandler = (e) => {
      const map = { 1: 'der', 2: 'die', 3: 'das', j: 'der', k: 'die', l: 'das' };
      if (map[e.key]) choose(map[e.key]);
      else if (e.key === 'z' || e.key === 'u') doUndo();
    };
  }

  // 拼写卡：看中文写德语
  function spellCard(w) {
    const shownAt = Date.now();
    const needArticle = w.pos === 'noun' && w.article;
    const hint = [POS_LABEL[w.pos], needArticle ? '连冠词一起写' : '', w.pos === 'verb' ? '写不定式' : '']
      .filter(Boolean)
      .join(' · ');
    shell(
      `<div class="card-body">
        <div class="big-zh">${esc(w.zh)}</div>
        ${hint ? `<div class="secondary t-sub" style="margin-top:6px">${hint}</div>` : ''}
        ${w.exampleZh ? `<div class="example secondary">${esc(w.exampleZh)}</div>` : ''}
        <form id="spellForm" class="spell-form" autocomplete="off">
          <input id="spellIn" lang="de" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${needArticle ? 'der / die / das …' : '德语'}">
          <div class="umlauts">${['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'].map((c) => `<button type="button" data-c="${c}">${c}</button>`).join('')}</div>
        </form>
        <div class="feedback" id="fb"></div>
      </div>`,
      `<div class="two">
        <button class="btn gray" id="giveUp">不会</button>
        <button class="btn" id="check">检查<kbd>↵</kbd></button>
      </div>`,
      metaHTML(w, 'spell'),
    );
    const input = $('#spellIn');
    setTimeout(() => input.focus(), 50);
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
      const cls = res.result === 'exact' ? 'ok' : res.result === 'near' ? 'near' : 'bad';
      const fb = $('#fb');
      fb.className = `feedback ${cls}`;
      fb.innerHTML = `
        <div class="fb-badge">${{ ok: '正确', near: '差一点', bad: '不对' }[cls]}</div>
        <div class="fb-word">${wordHTML(w)}</div>
        ${res.why ? `<div class="fb-hint">${esc(res.why)}</div>` : ''}
        ${w.example ? `<div class="fb-hint" lang="de">${esc(w.example)}</div>` : ''}`;
      if (state.settings.autoSpeak) speak(displayWord(w));
      let buttons;
      let def;
      if (res.result === 'exact') {
        buttons = [
          [2, '困难'],
          [3, '良好'],
          [4, '简单'],
        ];
        def = 3;
      } else if (res.result === 'near') {
        buttons = [
          [1, '重来'],
          [2, '算对'],
        ];
        def = 2;
      } else {
        buttons = [
          [1, '继续'],
          [3, '我其实对了'],
        ];
        def = 1;
      }
      $('.study-actions').innerHTML = `<div class="rate n${buttons.length}">${buttons
        .map(([g, l]) => `<button class="r${g} ${g === def ? 'def' : ''}" data-g="${g}"><b>${l}</b></button>`)
        .join('')}</div>`;
      $$('.rate button').forEach((b) => b.addEventListener('click', () => rate(w, 'spell', +b.dataset.g, shownAt)));
      keyHandler = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
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
    $('#giveUp').addEventListener('click', () => !checked && finish({ result: 'wrong' }));
  }

  // 冠词自由练习
  let drill = null;
  function startDrill() {
    const pool = S.drillPool();
    if (!pool.length) return toast('先学几个名词，冠词卡才会出现');
    const recent = [];
    let right = 0;
    let total = 0;
    let streak = 0;
    drill = {
      scoreHTML: () =>
        total ? `<span class="tag">${right}/${total}</span>${streak >= 3 ? `<span class="tag t-article">连对 ${streak}</span>` : ''}` : '',
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
      for (const t of types) {
        const c = w.cards[t];
        if (c && (c.state === 'learning' || c.state === 'relearning')) pendingDue.push(c.due);
      }
    }
    pendingDue.sort((a, b) => a - b);
    const counts = S.todayCounts();
    $app.innerHTML = `
      <div class="study">
        <div class="study-bar"><a href="#home" class="icon-btn glass" aria-label="完成">${ICON.close}</a><span></span><span></span></div>
        <div class="finish">
          <div class="done-circle">${ICON.check}</div>
          <h2>${session.done ? '这一轮完成了' : '现在没有要做的卡'}</h2>
          ${session.done ? `<p class="secondary">完成 ${session.done} 张，重来 ${session.again} 次</p>` : ''}
          ${pendingDue.length ? `<p class="secondary t-sub">还有 ${pendingDue.length} 张学习中的卡，最早 ${formatIvl(pendingDue[0] - Date.now())}后到期</p>` : ''}
          <div class="btns">
            ${
              mode === 'article'
                ? `<button class="btn" id="drill">自由练习冠词</button>
                   <p class="secondary t-foot" style="margin:0 0 6px">从学过的名词里随机抽，易错的出现更多，答错会重新安排复习</p>`
                : ''
            }
            ${mode === 'study' ? `<a class="btn tinted" href="#article">冠词快练</a>` : ''}
            ${mode === 'article' && counts.total ? `<a class="btn tinted" href="#study">继续今日学习（${counts.total}）</a>` : ''}
            <a class="btn gray" href="#home">回到今天</a>
          </div>
        </div>
      </div>`;
    $('#drill')?.addEventListener('click', startDrill);
    syncNow();
  }

  next();
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    syncNow();
  };
}

// 词库
function wordsView() {
  setNav({ title: '词库' });
  let q = '';
  let source = local.get('wordsSource', 'all');
  let status = local.get('wordsStatus', 'all');
  let limit = 150;

  $app.innerHTML = `
    ${largeTitle('词库')}
    <div class="search">${ICON.search}<input id="search" type="search" placeholder="搜索德语、中文或标签" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
    <div class="menus">
      <select id="fSource" class="menu">
        <option value="all">全部来源</option>
        ${Object.entries(S.SOURCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <select id="fStatus" class="menu">
        <option value="all">全部状态</option>
        ${Object.entries(S.STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        <option value="hardArticle">冠词易错</option>
        <option value="incomplete">信息不全</option>
      </select>
    </div>
    <section class="section">
      <div class="section-header" id="count"></div>
      <div class="list" id="list"></div>
    </section>`;
  $('#fSource').value = source;
  $('#fStatus').value = status;

  const incomplete = (w) => !w.zh || (w.pos === 'noun' && (!w.article || !w.plural));

  function render() {
    const ql = q.toLowerCase();
    const list = S.liveWords().filter((w) => {
      if (source !== 'all' && w.source !== source) return false;
      if (status === 'hardArticle') {
        if (!(w.cards.article?.lapses >= 1)) return false;
      } else if (status === 'incomplete') {
        if (!incomplete(w)) return false;
      } else if (status !== 'all' && S.wordStatus(w) !== status) return false;
      if (!ql) return true;
      return (
        w.lemma.toLowerCase().includes(ql) ||
        (w.zh || '').includes(q) ||
        (w.tags || []).some((t) => t.toLowerCase().includes(ql)) ||
        (w.plural || '').toLowerCase().includes(ql)
      );
    });
    if (status === 'hardArticle') list.sort((a, b) => b.cards.article.lapses - a.cards.article.lapses);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    $('#count').textContent = `${list.length} 个词`;
    const box = $('#list');
    box.hidden = !list.length;
    box.innerHTML =
      list
        .slice(0, limit)
        .map((w) => {
          const st = S.wordStatus(w);
          const pl = w.plural && w.plural !== NO_PLURAL ? `<span class="secondary t-sub"> · ${esc(w.plural)}</span>` : '';
          return row({
            title: `<span class="wr-de" lang="de">${wordHTML(w)}</span>${pl}`,
            sub: esc(shortZh(w.zh)) || '<span class="warn-text">缺释义</span>',
            detail: `<span class="status s-${st}">${S.STATUS_LABEL[st]}</span>`,
            href: `#word/${encodeURIComponent(w.id)}`,
            cls: 'word-row',
          });
        })
        .join('') +
      (list.length > limit ? `<button class="row action center" id="more">再显示 ${Math.min(150, list.length - limit)} 个</button>` : '');
    $('#empty')?.remove();
    if (!list.length) box.insertAdjacentHTML('afterend', '<p class="empty" id="empty">没有匹配的词</p>');
    $('#more')?.addEventListener('click', () => {
      limit += 150;
      render();
    });
  }
  $('#search').addEventListener('input', (e) => {
    q = e.target.value.trim();
    limit = 150;
    render();
  });
  $('#fSource').addEventListener('change', (e) => {
    source = e.target.value;
    local.set('wordsSource', source);
    render();
  });
  $('#fStatus').addEventListener('change', (e) => {
    status = e.target.value;
    local.set('wordsStatus', status);
    render();
  });
  render();
}

// 编辑单词
function editView(id) {
  const w = state.words.get(id);
  if (!w || w.deleted) {
    setNav({ title: '', back: { href: '#words', label: '词库' }, large: false });
    $app.innerHTML = '<p class="empty">找不到这个词</p>';
    return;
  }
  setNav({
    title: displayWord(w),
    back: { href: '#words', label: '词库' },
    extra: `<button class="nav-pill glass-tint" id="saveBtn">保存</button>`,
    large: false,
  });
  const opt = (obj, cur) =>
    Object.entries(obj)
      .map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`)
      .join('');
  const cardRows = S.CARD_TYPES.filter((t) => w.cards[t] || S.eligible(w, t))
    .map((t) => {
      const c = S.getCard(w, t);
      const sub = c.state === 'new' ? '' : `稳定性 ${c.s.toFixed(1)} 天 · 遗忘 ${c.lapses || 0} 次`;
      return row({ title: S.TYPE_LABEL[t], sub, detail: dueText(c) });
    })
    .join('');
  const noAutoFix = 'autocapitalize="off" autocorrect="off" spellcheck="false"';

  $app.innerHTML = `
    <div style="height:12px"></div>
    <form id="editForm">
      <section class="section">
        <div class="section-header">单词</div>
        <div class="list">
          <div class="row">
            <div class="segmented in-row" id="artSeg">
              ${['', ...ARTICLES].map((a) => `<button type="button" data-a="${a}" class="${a === (w.article || '') ? 'on' : ''}">${a || '无'}</button>`).join('')}
            </div>
          </div>
          <label class="row field"><span>单词</span><input name="lemma" value="${esc(w.lemma)}" required lang="de" ${noAutoFix}></label>
          <label class="row field"><span>复数</span><input name="plural" value="${esc(w.plural)}" placeholder="无复数填 —" lang="de" ${noAutoFix}></label>
          <label class="row field"><span>词性</span><select name="pos"><option value="">未设置</option>${opt(POS_LABEL, w.pos)}</select>${ICON.chev}</label>
          <label class="row field"><span>变化</span><input name="forms" value="${esc(w.forms)}" placeholder="过去式, 完成时" lang="de" ${noAutoFix}></label>
        </div>
      </section>
      <section class="section">
        <div class="section-header">释义</div>
        <div class="list">
          <label class="row field stack"><span>中文</span><textarea name="zh" rows="1">${esc(w.zh)}</textarea></label>
          <label class="row field stack"><span>例句</span><textarea name="example" rows="1" lang="de" ${noAutoFix}>${esc(w.example)}</textarea></label>
          <label class="row field stack"><span>例句翻译</span><textarea name="exampleZh" rows="1">${esc(w.exampleZh)}</textarea></label>
          <label class="row field stack"><span>笔记</span><textarea name="notes" rows="1" placeholder="搭配、易混词、记忆方法">${esc(w.notes)}</textarea></label>
        </div>
      </section>
      <section class="section">
        <div class="section-header">分类</div>
        <div class="list">
          <label class="row field"><span>来源</span><select name="source">${opt(S.SOURCES, w.source)}</select>${ICON.chev}</label>
          <label class="row field"><span>标签</span><input name="tags" value="${esc((w.tags || []).join(', '))}" placeholder="逗号分隔"></label>
        </div>
      </section>
    </form>
    <section class="section">
      <div class="section-header">复习进度</div>
      <div class="list">${cardRows}</div>
    </section>
    <section class="section">
      <div class="list">
        ${ttsAvailable() ? `<button class="row action" id="speak">朗读</button>` : ''}
        <button class="row action" id="suspend">${w.suspended ? '恢复复习' : '暂停复习'}</button>
        <button class="row action" id="reset">重置进度</button>
      </div>
    </section>
    <section class="section">
      <div class="list"><button class="row destructive" id="del">删除单词</button></div>
    </section>`;

  const form = $('#editForm');
  $$('.field textarea', form).forEach(autoGrow);
  let article = w.article || '';
  $('#artSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    article = b.dataset.a;
    $$('#artSeg button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#speak')?.addEventListener('click', () => speak(displayWord(w)));
  const save = async () => {
    if (!form.reportValidity()) return;
    const f = Object.fromEntries(new FormData(form));
    Object.assign(w, {
      article,
      lemma: f.lemma.trim(),
      pos: f.pos || (article ? 'noun' : ''),
      plural: f.plural.trim(),
      forms: f.forms.trim(),
      zh: f.zh.trim(),
      example: f.example.trim(),
      exampleZh: f.exampleZh.trim(),
      notes: f.notes.trim(),
      source: f.source,
      tags: f.tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
    await S.saveWord(w);
    toast('已保存');
    history.length > 1 ? history.back() : (location.hash = '#words');
  };
  document.getElementById('saveBtn').addEventListener('click', save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });
  $('#suspend').addEventListener('click', async () => {
    w.suspended = !w.suspended;
    await S.saveWord(w);
    toast(w.suspended ? '已暂停，不会再出现在复习里' : '已恢复复习');
    route();
  });
  $('#reset').addEventListener('click', async () => {
    if (!confirm('把这个词的所有卡片恢复成新词？')) return;
    await S.resetProgress(w);
    route();
  });
  $('#del').addEventListener('click', async () => {
    if (!confirm(`删除「${displayWord(w)}」？`)) return;
    await S.deleteWord(w);
    toast('已删除');
    location.hash = '#words';
  });
}

// 添加
function addView() {
  setNav({ title: '添加' });
  let items = [];
  const src = local.get('addSource', 'exam');
  const tags = pendingAdd ? '' : local.get('addTags', '');
  $app.innerHTML = `
    ${largeTitle('添加')}
    <div class="segmented" id="seg">
      ${Object.entries(S.SOURCES).map(([k, v]) => `<button type="button" data-v="${k}" class="${k === src ? 'on' : ''}">${v}</button>`).join('')}
    </div>
    <section class="section">
      <div class="list">
        <label class="row field"><span>标签</span><input id="tags" value="${esc(tags)}" placeholder="如 Goethe B1、第 3 课"></label>
        <div class="row">
          <textarea class="bare" id="lines" rows="7" lang="de" autocapitalize="off" autocorrect="off" spellcheck="false" style="min-height:9em" placeholder="一行一个词
der Tisch, -e 桌子
die Mutter, ¨ 母亲
gehen, ging, ist gegangen 走
Zeitung"></textarea>
        </div>
      </div>
      <div class="section-footer">可以直接粘贴 Excel 或 Numbers 的两列（德语、中文）。复数写成 -e、¨-er、- 都行，会自动算出完整形式。</div>
    </section>
    <section class="section"><button class="btn" id="parse">识别</button></section>
    <div id="preview"></div>`;

  $('#seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('#seg button').forEach((x) => x.classList.toggle('on', x === b));
    local.set('addSource', b.dataset.v);
  });
  const getSource = () => $('#seg .on')?.dataset.v || 'daily';
  if (pendingAdd) {
    $('#lines').value = pendingAdd;
    pendingAdd = '';
    setTimeout(doParse, 0);
  }

  function doParse() {
    items = $('#lines').value.split(/\r?\n/).map(parseLine).filter(Boolean);
    const seen = new Set();
    for (const it of items) {
      const key = `${it.article}|${it.lemma.toLowerCase()}`;
      it.dup = Boolean(S.findDuplicate(it.lemma, it.article)) || seen.has(key);
      seen.add(key);
    }
    renderPreview();
    if (items.length) $('#preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#parse').addEventListener('click', doParse);

  const missingCount = () => items.filter((x) => !x.dup && isIncomplete(x)).length;
  const headerText = () => {
    const fresh = items.filter((i) => !i.dup).length;
    const dup = items.length - fresh;
    const miss = missingCount();
    return [`${fresh} 个新词`, dup ? `${dup} 个重复会跳过` : '', miss ? `${miss} 个待补全` : ''].filter(Boolean).join(' · ');
  };

  function renderPreview() {
    const box = $('#preview');
    if (!items.length) {
      box.innerHTML = '';
      return;
    }
    const fresh = items.filter((i) => !i.dup);
    box.innerHTML = `
      <section class="section">
        <div class="section-header" id="pvHead">${headerText()}</div>
        <div class="list">
          ${items
            .map((it, i) => {
              const pl = it.plural ? `<span class="secondary t-sub"> · ${esc(it.plural === NO_PLURAL ? '无复数' : it.plural)}</span>` : '';
              const forms = it.forms ? `<span class="secondary t-sub"> · ${esc(it.forms)}</span>` : '';
              let body;
              if (it.dup) body = '<div class="row-sub">已在词库里</div>';
              else {
                body = '';
                if (it.pos === 'noun' && !it.article) {
                  body += `<div class="pv-art">${ARTICLES.map((a) => `<button class="b-${a}" data-i="${i}" data-a="${a}">${a}</button>`).join('')}</div>`;
                }
                body += it.zh
                  ? `<div class="row-sub">${esc(it.zh)}</div>`
                  : `<input class="pv-zh" data-i="${i}" placeholder="中文释义" autocomplete="off" enterkeyhint="next">`;
              }
              return `<div class="row pv ${it.dup ? 'dup' : ''}">
                <div class="row-main"><div lang="de">${wordHTML(it)}${pl}${forms}</div>${body}</div>
                <button class="x" data-i="${i}" aria-label="移除">✕</button>
              </div>`;
            })
            .join('')}
        </div>
        <div class="section-footer">没补全的也可以先导入，之后在词库里筛选“信息不全”。</div>
      </section>
      <section class="section">
        <button class="btn" id="import" ${fresh.length ? '' : 'disabled'}>导入 ${fresh.length} 个词</button>
      </section>`;
    $$('.pv .x', box).forEach((b) =>
      b.addEventListener('click', () => {
        items.splice(+b.dataset.i, 1);
        renderPreview();
      }),
    );
    $$('.pv-art button', box).forEach((b) =>
      b.addEventListener('click', () => {
        items[+b.dataset.i].article = b.dataset.a;
        renderPreview();
      }),
    );
    $$('.pv-zh', box).forEach((inp) => {
      // 失焦时保存；只刷新计数，不重绘列表，免得打断输入
      inp.addEventListener('change', () => {
        items[+inp.dataset.i].zh = inp.value.trim();
        $('#pvHead', box).textContent = headerText();
      });
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
    $$('.pv-zh').forEach((inp) => (items[+inp.dataset.i].zh = inp.value.trim()));
    const source = getSource();
    const tagList = $('#tags')
      .value.split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    local.set('addTags', $('#tags').value);
    const words = items.filter((i) => !i.dup).map((i) => S.makeWord({ ...i, source, tags: tagList }));
    // 保持输入顺序：createdAt 递增
    const base = Date.now();
    words.forEach((w, i) => (w.createdAt = base + i));
    await S.addWords(words);
    toast(`已导入 ${words.length} 个词`);
    items = [];
    $('#lines').value = '';
    renderPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// 统计
function statsView() {
  setNav({ title: '统计' });
  const st = S.stats();
  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}<small>%</small>`);
  const bars = (arr, labels) => {
    const max = Math.max(1, ...arr);
    return `<div class="bars">${arr
      .map(
        (v, i) =>
          `<div class="bar"><div class="bar-v ${v ? '' : 'zero'}" style="height:${(v / max) * 100}%"></div><span class="bar-n">${v || ''}</span><span class="bar-l">${labels[i]}</span></div>`,
      )
      .join('')}</div>`;
  };
  const today = dayStart(Date.now());
  const dayLbl = (ts) => `${new Date(ts).getMonth() + 1}/${new Date(ts).getDate()}`;
  const pastLabels = st.perDay.map((_, i) => (i === 13 ? '今天' : i % 2 ? '' : dayLbl(today - (13 - i) * DAY)));
  const futLabels = st.forecast.map((_, i) => (i === 0 ? '今天' : i === 1 ? '明天' : dayLbl(today + i * DAY)));
  const segs = ['new', 'learning', 'young', 'mature', 'suspended'];

  $app.innerHTML = `
    ${largeTitle('统计')}
    <div class="tiles">
      <div class="tile"><div class="summary-label">连续</div><div class="summary-num" style="color:var(--orange)">${st.streak}<small>天</small></div></div>
      <div class="tile"><div class="summary-label">今日</div><div class="summary-num" style="color:var(--green)">${st.todayReviews}<small>张</small></div></div>
      <div class="tile"><div class="summary-label">用时</div><div class="summary-num" style="color:var(--blue)">${st.todayMinutes}<small>分钟</small></div></div>
      <div class="tile"><div class="summary-label">词库</div><div class="summary-num" style="color:var(--tint)">${st.total}<small>词</small></div></div>
    </div>
    <section class="section">
      <div class="section-header">词库状态</div>
      <div class="list"><div class="chart-cell">
        <div class="status-stack">${segs
          .filter((s) => st.byStatus[s])
          .map((s) => `<div class="seg-bar s-${s}" style="flex:${st.byStatus[s]}" title="${S.STATUS_LABEL[s]}"></div>`)
          .join('')}</div>
        <div class="legend">${segs.map((s) => `<span><i class="s-${s}"></i>${S.STATUS_LABEL[s]} ${st.byStatus[s]}</span>`).join('')}</div>
      </div></div>
    </section>
    <section class="section">
      <div class="section-header">近 30 天记住的比例</div>
      <div class="list">
        ${S.CARD_TYPES.map((t) => row({ title: S.TYPE_LABEL[t], detail: `<span class="t-headline" style="color:var(--label)">${pct(st.retention[t]).replace('<small>%</small>', '%')}</span>` })).join('')}
      </div>
      <div class="section-footer">目标是 ${Math.round(state.settings.retention * 100)}%。明显偏低说明新词加得太快，可以在设置里减少每天新词。</div>
    </section>
    <section class="section">
      <div class="section-header">未来 7 天复习量</div>
      <div class="list"><div class="chart-cell">${bars(st.forecast, futLabels)}</div></div>
    </section>
    <section class="section">
      <div class="section-header">近 14 天练习量</div>
      <div class="list"><div class="chart-cell">${bars(st.perDay, pastLabels)}</div></div>
    </section>
    ${
      st.hardArticles.length
        ? `<section class="section">
            <div class="section-header">冠词老是记错</div>
            <div class="list">${st.hardArticles
              .map((w) => row({ title: `<span lang="de">${wordHTML(w)}</span>`, detail: `错 ${Number(w.cards.article.lapses) || 0} 次`, href: `#word/${encodeURIComponent(w.id)}` }))
              .join('')}</div>
          </section>`
        : ''
    }`;
}

// 设置
function syncStatusHTML() {
  if (sync.status === 'off') return row({ title: '未连接', sub: '进度只保存在这台设备上', icon: icon('cloud', 'gray') });
  const color = { idle: 'green', error: 'red', offline: 'gray' }[sync.status] || 'orange';
  return row({
    title: SYNC_LABEL[sync.status],
    sub: sync.error ? `<span class="danger-text">${esc(sync.error)}</span>` : `上次同步 ${relTime(sync.lastSync)}`,
    icon: icon('cloud', color),
  });
}

function stepperRow(name, label, value, ic, { min = 0, max = 300, step = 5 } = {}) {
  return `<div class="row has-icon">${ic}
    <div class="row-main"><div class="row-title">${label}</div></div>
    <div class="row-detail" id="v-${name}">${value}</div>
    <div class="stepper" data-name="${name}" data-min="${min}" data-max="${max}" data-step="${step}">
      <button type="button" data-d="-1" aria-label="减少">−</button><button type="button" data-d="1" aria-label="增加">+</button>
    </div>
  </div>`;
}

function settingsView() {
  setNav({ title: '设置' });
  const s = state.settings;
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $app.innerHTML = `
    ${largeTitle('设置')}
    <section class="section">
      <div class="section-header">每日学习量</div>
      <div class="list">
        ${stepperRow('newPerDay', '新词', s.newPerDay, icon('sparkle', 'blue'))}
        ${stepperRow('articleNewPerDay', '新冠词卡', s.articleNewPerDay, stripesIcon)}
        ${stepperRow('spellNewPerDay', '新拼写卡', s.spellNewPerDay, icon('pencil', 'orange'))}
      </div>
      <div class="section-footer">冠词卡在学过词义之后出现；拼写卡要等词义记牢才出现。</div>
    </section>

    <section class="section">
      <div class="section-header">复习</div>
      <div class="list">
        <label class="row has-icon field">${icon('target', 'indigo')}<span style="width:auto;flex:1">目标记忆率</span>
          <select id="retention">
            ${[
              [0.85, '85%'],
              [0.9, '90%'],
              [0.95, '95%'],
            ]
              .map(([v, l]) => `<option value="${v}" ${Math.abs(v - s.retention) < 0.001 ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>${ICON.chev}
        </label>
        <label class="row has-icon">${icon('pencil', 'green')}<div class="row-main">拼写练习</div><input type="checkbox" class="switch" id="spell" ${s.spell ? 'checked' : ''}></label>
        <label class="row has-icon">${icon('speaker', 'red')}<div class="row-main">自动朗读</div><input type="checkbox" class="switch" id="autoSpeak" ${s.autoSpeak ? 'checked' : ''}></label>
      </div>
      <div class="section-footer">90% 适合平时；考前冲刺可以调到 95%，复习量大约翻倍。</div>
    </section>

    <section class="section">
      <div class="section-header">同步</div>
      <div class="list">
        <div id="syncInfo">${syncStatusHTML()}</div>
        <form id="tokenForm" class="row has-icon">${icon('key', 'gray')}
          <input class="bare" type="password" id="token" placeholder="同步口令" value="${esc(sync.token)}" autocomplete="off" enterkeyhint="go">
          <button class="btn small">${sync.token ? '更新' : '连接'}</button>
        </form>
        ${sync.token ? '<button class="row action" id="syncNow">立即同步</button>' : ''}
      </div>
      <div class="section-footer">三台设备填同一个口令。数据先存在本机，联网后自动同步；两台设备改了同一个词，以后改的为准。</div>
    </section>

    ${
      standalone
        ? ''
        : `<section class="section">
      <div class="section-header">添加到主屏幕</div>
      <div class="list">
        ${row({ title: 'iPhone / iPad', sub: 'Safari 点“分享”，选“添加到主屏幕”' })}
        ${row({ title: 'Mac', sub: 'Safari 菜单“文件” → “添加到程序坞”' })}
      </div>
      <div class="section-footer">添加后打开就像独立 App，没网也能用。长期不打开的网站，Safari 会清掉它的本地数据，添加到主屏幕后就不会被清。</div>
    </section>`
    }

    <section class="section">
      <div class="section-header">数据</div>
      <div class="list">
        <button class="row action has-icon" id="exportJson">${icon('up', 'blue')}<div class="row-main" style="color:var(--label)">导出备份</div></button>
        <label class="row action has-icon">${icon('down', 'green')}<div class="row-main" style="color:var(--label)">导入备份</div><input type="file" id="importJson" accept="application/json,.json" hidden></label>
        <button class="row action has-icon" id="exportCsv">${icon('book', 'gray')}<div class="row-main" style="color:var(--label)">导出 CSV</div></button>
      </div>
    </section>
    <section class="section">
      <div class="list"><button class="row destructive center" id="wipe">清空这台设备上的数据</button></div>
      <div class="section-footer" style="text-align:center">Mac 快捷键：空格 翻面 / 良好 · 1–4 评分 · 冠词 1 2 3 · R 朗读 · Z 撤销</div>
    </section>`;

  // 步进器
  let saveTimer;
  $$('.stepper').forEach((st) =>
    st.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const { name, min, max, step } = st.dataset;
      const v = Math.min(+max, Math.max(+min, state.settings[name] + +b.dataset.d * +step));
      state.settings[name] = v;
      $(`#v-${name}`).textContent = v;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => S.saveSettings({ [name]: v }), 400);
    }),
  );
  $('#retention').addEventListener('change', (e) => S.saveSettings({ retention: +e.target.value }));
  $('#spell').addEventListener('change', (e) => S.saveSettings({ spell: e.target.checked }));
  $('#autoSpeak').addEventListener('change', (e) => S.saveSettings({ autoSpeak: e.target.checked }));

  $('#tokenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      await setToken($('#token').value);
      toast(sync.token ? '已连接' : '已关闭同步');
      route();
    } catch (err) {
      toast(err.message, 3500);
      btn.disabled = false;
    }
  });
  $('#syncNow')?.addEventListener('click', async () => {
    await syncNow();
    toast(sync.status === 'error' ? sync.error : '已同步');
  });

  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const stamp = new Date().toISOString().slice(0, 10);
  $('#exportJson').addEventListener('click', () =>
    download(`vocab-de-${stamp}.json`, JSON.stringify(S.exportData()), 'application/json'),
  );
  $('#exportCsv').addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['article', 'lemma', 'plural', 'pos', 'forms', 'zh', 'example', 'exampleZh', 'source', 'tags', 'status']];
    for (const w of S.liveWords()) {
      rows.push([w.article, w.lemma, w.plural, w.pos, w.forms, w.zh, w.example, w.exampleZh, w.source, (w.tags || []).join(';'), S.wordStatus(w)]);
    }
    download(`vocab-de-${stamp}.csv`, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\n'), 'text/csv');
  });
  $('#importJson').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await S.importData(JSON.parse(await file.text()));
      toast(`导入了 ${r.words} 个词、${r.logs} 条记录`);
    } catch (err) {
      toast(err.message, 3500);
    }
  });
  $('#wipe').addEventListener('click', async () => {
    const msg = sync.token
      ? '清空这台设备上的词库和进度？服务器上的数据不受影响，重新连接后会同步回来。'
      : '还没开同步，清空后数据就找不回了。确定清空？';
    if (!confirm(msg)) return;
    await S.wipeLocal();
    location.reload();
  });
}

// 启动
async function boot() {
  try {
    await S.load();
  } catch (err) {
    $app.innerHTML = `<p class="empty">本地数据库打不开：${esc(err.message)}。如果是无痕浏览模式，请换成普通窗口。</p>`;
    return;
  }
  await initSync();
  onSyncChange(renderSync);
  onRemoteChange(() => {
    if (['home', 'words', 'stats'].includes(current)) route();
  });
  renderSync();
  window.addEventListener('hashchange', route);
  route();
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
