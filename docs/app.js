import { store, THEMES, ENGINES, hostOf, titleFromURL } from './store.js';
import { Conversation, MODELS, EFFORTS, ClaudeError } from './ai.js';
import { renderMarkdown, escapeHTML as esc } from './markdown.js';

// ---------------------------------------------------------------- icons

const svg = (body, fill = false) =>
  `<svg viewBox="0 0 24 24" class="${fill ? 'fill' : ''}" aria-hidden="true">${body}</svg>`;
const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  sparkles: svg('<path d="M11 2.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/><path d="M19 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/>', true),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  archive: svg('<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  more: svg('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', true),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  pin: svg('<path d="M9 3.5h6l-1 6.5 3 3H7l3-3zM12 13v7.5"/>'),
  send: svg('<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>'),
  stop: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>', true),
  clipboard: svg('<rect x="5.5" y="4" width="13" height="17" rx="2"/><path d="M9 4h6v3H9z"/>'),
  compose: svg('<path d="M12 20h8.5M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  open: svg('<path d="M7 17 17 7M9 7h8v8"/>'),
  sidebar: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'),
  chevron: svg('<path d="m7 10 5 5 5-5"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
};

// Spread hashed hues with the golden angle so neighbouring letters get distinct colors.
const hueOf = (text) => Math.round(([...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1000) * 137.508) % 360;
const favicon = (url, size = 20) => {
  const host = hostOf(url);
  const letter = esc((host.replace(/^(m|mobile|mail|news)\./, '')[0] || '•').toUpperCase());
  const fallback = `<span class="fav-fallback" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.52)}px;--h:${hueOf(host)}">${letter}</span>`;
  if (!host) return fallback;
  return `<img class="fav" width="${size}" height="${size}" loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(
    host
  )}&sz=64" onerror="this.outerHTML=this.dataset.fallback" data-fallback="${esc(fallback)}">`;
};

const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'auto' });
function ago(time) {
  const minutes = Math.round((time - Date.now()) / 60000);
  if (Math.abs(minutes) < 1) return 'たった今';
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

// ---------------------------------------------------------------- helpers

const $ = (sel, root = document) => root.querySelector(sel);
const app = document.getElementById('app');

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

/** Opens a site. In a Home Screen web app iOS shows it in an in-app Safari view; "Done" returns to Kumo. */
function openExternal(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function parseURL(raw) {
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    if (['http:', 'https:'].includes(url.protocol) && url.hostname) return url.href;
  } catch {}
  try {
    const url = new URL('https://' + text);
    const labels = url.hostname.split('.');
    const tld = labels[labels.length - 1];
    const isIPv4 = labels.length === 4 && labels.every((l) => /^\d+$/.test(l));
    if (url.hostname === 'localhost' || isIPv4 || (labels.length >= 2 && /^[a-z]{2,}$/i.test(tld))) return url.href;
  } catch {}
  return null;
}

function looksLikeQuestion(raw) {
  const t = raw.trim().toLowerCase();
  if (/[?？]$/.test(t)) return true;
  const starters = ['なぜ', 'どう', '何', 'なに', '教えて', '要約', '説明', 'まとめ', '比較', '翻訳', 'このページ', 'おすすめ',
    'what ', 'why ', 'how ', 'who ', 'explain', 'summarize', 'compare', 'translate'];
  return starters.some((s) => t.startsWith(s)) || t.length > 40;
}

const searchURL = (query) => (ENGINES[store.settings.engine] || ENGINES.google).url + encodeURIComponent(query);

function openURL(url, title) {
  const tab = store.touchTab(url, title);
  openExternal(tab.url);
}

function openTab(tab) {
  store.useTab(tab);
  openExternal(tab.url);
}

// ---------------------------------------------------------------- layers (sheets & overlays)

const layers = [];

function pushLayer(className, html, { onClose } = {}) {
  const el = document.createElement('div');
  el.className = `layer ${className}`;
  el.innerHTML = html;
  el.addEventListener('click', (e) => {
    if (e.target === el) popLayer();
  });
  document.body.appendChild(el);
  layers.push({ el, onClose });
  requestAnimationFrame(() => el.classList.add('open'));
  return el;
}

function popLayer() {
  const layer = layers.pop();
  if (!layer) return;
  layer.onClose?.();
  layer.el.classList.remove('open');
  setTimeout(() => layer.el.remove(), 250);
}

/** iOS keyboard: keep overlays sized to the visible viewport. */
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.documentElement.style.setProperty('--vvt', `${vv.offsetTop}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

function actionSheet(title, actions) {
  const el = pushLayer(
    'sheet-layer',
    `<div class="sheet action-sheet">
      ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      ${actions.map((a, i) => `<button class="sheet-action ${a.destructive ? 'destructive' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
      <button class="sheet-action cancel" data-i="-1">キャンセル</button>
    </div>`
  );
  el.querySelectorAll('.sheet-action').forEach((btn) =>
    btn.addEventListener('click', () => {
      const action = actions[Number(btn.dataset.i)];
      popLayer();
      action?.run();
    })
  );
}

// ---------------------------------------------------------------- main screen

/** Draft of the home "Ask anything" box: text plus tabs attached as context (Dia's "Add tabs"). */
const askDraft = { text: '', tabIds: [], mode: null }; // mode: null = auto, 'search' | 'ai'
let askSuggestions = [];

function renderShell() {
  app.innerHTML = `
    <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <header class="topbar">
      <div class="topbar-row">
        <button class="space-pill glass" data-action="space-switcher" id="space-pill"></button>
        <span class="spacer"></span>
        <button class="icon-btn glass" data-action="settings" aria-label="設定">${ICON.settings}</button>
      </div>
      <div class="bookmarks" id="bookmarks"></div>
    </header>
    <main id="home"></main>
    <nav class="dock">
      <div class="dock-inner">
        <button class="dock-btn" data-action="sidebar" aria-label="サイドバー">${ICON.sidebar}</button>
        <button class="dock-search" data-action="command">${ICON.search}<span>検索・URL</span></button>
        <button class="dock-btn dock-ai" data-action="assistant" aria-label="AIアシスタント">${ICON.sparkles}</button>
      </div>
    </nav>
    <div class="sb-scrim" data-action="close-sidebar"></div>
    <aside class="sidebar" id="sidebar" aria-label="サイドバー"></aside>`;

  app.addEventListener('click', onAppClick);
  app.addEventListener('input', (e) => {
    if (e.target.matches('.ask-input')) {
      askDraft.text = e.target.value;
      if (!askDraft.text.trim()) askDraft.mode = null;
      autosize(e.target);
      updateAskUI();
    }
  });
  app.addEventListener('keydown', (e) => {
    // Enter runs the highlighted action (IME composition keeps working: isComposing / keyCode 229).
    if (e.target.matches('.ask-input') && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submitAsk();
    }
  });
  app.addEventListener('submit', (e) => {
    if (!e.target.matches('.ask-card')) return;
    e.preventDefault();
    submitAsk();
  });
  enableSpaceSwipe($('#home'));
  enableSidebarGestures();
}

function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

function render() {
  const space = store.currentSpace;
  const [g1, g2] = THEMES[space.theme] || THEMES.ocean;
  document.documentElement.style.setProperty('--g1', g1);
  document.documentElement.style.setProperty('--g2', g2);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg || g1);
  renderTopbar();
  renderHome();
  renderSidebar();
}

function renderTopbar() {
  const space = store.currentSpace;
  $('#space-pill').innerHTML = `<span>${esc(space.emoji)}</span><strong>${esc(space.name)}</strong>${ICON.chevron}`;
  const bar = $('#bookmarks');
  bar.hidden = !store.settings.showBookmarks;
  bar.innerHTML =
    store.state.bookmarks
      .map(
        (b) => `<button class="bookmark" data-action="bookmark" data-id="${b.id}" data-menu="bookmark">
          ${favicon(b.url, 16)}<span>${esc(b.title)}</span></button>`
      )
      .join('') + `<button class="bookmark add" data-action="add-bookmark" aria-label="ブックマークを追加">${ICON.plus}</button>`;
}

function greeting() {
  const h = new Date().getHours();
  return h >= 5 && h < 11 ? 'おはようございます' : h < 18 && h >= 11 ? 'こんにちは' : 'こんばんは';
}

function askCardHTML() {
  const attached = askDraft.tabIds.map((id) => store.findTab(id)).filter(Boolean);
  const engine = (ENGINES[store.settings.engine] || ENGINES.google).name;
  return `<form class="ask-card">
      <div class="ask-row">
        <textarea class="ask-input" rows="1" enterkeyhint="go" autocapitalize="off" placeholder="検索、またはAIに質問…">${esc(askDraft.text)}</textarea>
      </div>
      ${
        attached.length
          ? `<div class="ask-chips">${attached
              .map((t) => `<span class="ask-chip">${favicon(t.url, 14)}<span>${esc(t.title)}</span>
                <button type="button" data-action="detach" data-id="${t.id}" aria-label="外す">${ICON.x}</button></span>`)
              .join('')}</div>`
          : ''
      }
      <div class="ask-suggest"></div>
      <div class="ask-foot">
        <button type="button" class="ask-tool" data-action="attach" aria-label="タブを追加">${ICON.plus}<span>タブ</span></button>
        <div class="mode-toggle" role="radiogroup" aria-label="送信先">
          <button type="button" role="radio" data-action="ask-mode" data-mode="search">${ICON.search}<span>${esc(engine)}</span></button>
          <button type="button" role="radio" data-action="ask-mode" data-mode="ai">${ICON.sparkles}<span>AI</span></button>
        </div>
        <span class="spacer"></span>
        <button type="submit" class="ask-send" aria-label="実行">${ICON.send}</button>
      </div>
    </form>`;
}

/** What Enter does right now: open a URL, search with the chosen engine, or ask the AI. */
function resolveAskKind() {
  const text = askDraft.text.trim();
  if (askDraft.mode === 'search') return 'search';
  if (askDraft.mode === 'ai' || askDraft.tabIds.length) return 'ask';
  if (parseURL(text)) return 'open';
  return text && looksLikeQuestion(text) ? 'ask' : 'search';
}

function updateAskUI() {
  const card = $('.ask-card');
  if (!card) return;
  const text = askDraft.text.trim();
  const kind = resolveAskKind();
  card.classList.toggle('has-text', !!text);
  card.querySelectorAll('[data-mode]').forEach((b) => {
    const on = (b.dataset.mode === 'ai' && kind === 'ask') || (b.dataset.mode === 'search' && kind === 'search');
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  $('.ask-send', card).innerHTML = kind === 'open' ? ICON.open : kind === 'search' ? ICON.search : ICON.send;

  if (!text) {
    askSuggestions = [];
    $('.ask-suggest', card).innerHTML = '';
    return;
  }
  const items = buildSuggestions(text);
  const index = items.findIndex((s) => s.kind === kind);
  if (index > 0) items.unshift(items.splice(index, 1)[0]);
  askSuggestions = items.slice(0, 6);
  $('.ask-suggest', card).innerHTML = askSuggestions
    .map(
      (s, i) => `<button type="button" class="sug-row ${i === 0 ? 'is-default' : ''} ${s.kind}" data-action="ask-suggest" data-i="${i}">
        <span class="sug-icon">${s.icon}</span>
        <span class="sug-text"><strong>${esc(s.title)}</strong><small>${esc(s.subtitle)}</small></span>
        ${i === 0 ? '<kbd>↵</kbd>' : ''}
      </button>`
    )
    .join('');
}

function renderHome() {
  const space = store.currentSpace;
  const tabs = store.tabsIn();
  const pinned = tabs.filter((t) => t.pinned);
  const today = tabs.filter((t) => !t.pinned);
  const current = store.currentTab;
  const focused = document.activeElement?.matches?.('.ask-input');

  $('#home').innerHTML = `
    ${installBanner()}
    <section class="hero">
      <div class="orb"></div>
      <h1 class="greet">${greeting()}</h1>
      <p class="hero-sub">${esc(space.name)} · ${tabs.length ? `${tabs.length}個のタブ` : 'タブなし'}</p>
    </section>

    ${askCardHTML()}

    ${
      current
        ? `<section class="current glass">
            <div class="current-label">閲覧中のタブ</div>
            <button class="current-main" data-action="open-tab" data-id="${current.id}">
              ${favicon(current.url, 28)}
              <span class="current-text"><strong>${esc(current.title)}</strong><small>${esc(hostOf(current.url))}</small></span>
              ${ICON.open}
            </button>
            <div class="current-actions">
              <button data-action="quick" data-prompt="要約">${ICON.sparkles}要約</button>
              <button data-action="quick" data-prompt="要点">要点</button>
              <button data-action="quick" data-prompt="翻訳">翻訳</button>
              <button data-action="assistant">質問する</button>
            </div>
          </section>`
        : ''
    }

    ${
      pinned.length
        ? `<section class="pinned">${pinned
            .map(
              (t) => `<button class="pin-tile" data-action="open-tab" data-id="${t.id}" data-menu="tab">
                <span class="pin-icon glass">${favicon(t.url, 28)}</span><span class="pin-title">${esc(t.title)}</span></button>`
            )
            .join('')}</section>`
        : ''
    }

    <section class="list-section">
      <div class="section-head">
        <span>今日</span>
        ${today.length ? `<button class="link" data-action="close-all">すべて閉じる</button>` : ''}
      </div>
      ${
        today.length
          ? `<div class="tab-list glass">${today.map(tabRow).join('')}</div>`
          : `<div class="empty glass">
              <p><strong>タブはまだありません</strong></p>
              <p>下の検索バーやブックマークからサイトを開くと、ここにタブとして並びます。ピン留めしていないタブは${
                Number(store.settings.archiveHours) ? `${store.settings.archiveHours}時間` : '…'
              }使わないと自動でアーカイブされます。</p>
            </div>`
      }
    </section>
    <p class="hint">左端からスワイプでサイドバー　·　左右スワイプでスペース切替</p>`;

  const input = $('.ask-input');
  autosize(input);
  updateAskUI();
  if (focused) input.focus();
}

function tabRow(t) {
  const isCurrent = store.currentTab?.id === t.id;
  return `<div class="tab-row ${isCurrent ? 'is-current' : ''}">
      <button class="tab-main" data-action="open-tab" data-id="${t.id}">
        ${favicon(t.url, 22)}
        <span class="tab-text"><span class="tab-title">${esc(t.title)}</span>
        <small>${esc(hostOf(t.url))} · ${ago(t.lastActive)}</small></span>
      </button>
      <button class="tab-btn" data-action="tab-menu" data-id="${t.id}" aria-label="メニュー">${ICON.more}</button>
      <button class="tab-btn" data-action="close-tab" data-id="${t.id}" aria-label="閉じる">${ICON.x}</button>
    </div>`;
}

function installBanner() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone || localStorage.getItem('kumo.installHintDismissed')) return '';
  return `<section class="install glass">
      <div><strong>ホーム画面に追加するとアプリになります</strong>
      <p>Safariの共有ボタン ${ICON.share} →「ホーム画面に追加」</p></div>
      <button class="tab-btn" data-action="dismiss-install" aria-label="閉じる">${ICON.x}</button>
    </section>`;
}

/** Runs a home-box action: open a URL, search with the chosen engine, ask the AI, or jump to a tab. */
function runAsk(suggestion) {
  const text = askDraft.text.trim();
  const tabIds = askDraft.tabIds.filter((id) => store.findTab(id));
  const kind = suggestion?.kind || resolveAskKind();
  if (!text && kind !== 'tab') return;
  askDraft.text = '';
  askDraft.tabIds = [];
  askDraft.mode = null;
  $('.ask-input')?.blur();
  if (kind === 'open') openURL(suggestion?.url || parseURL(text));
  else if (kind === 'search') openURL(searchURL(suggestion?.query || text));
  else if (kind === 'tab') openTab(suggestion.tab);
  else openAssistant({ question: suggestion?.query || text, tabIds });
  renderHome();
}

function submitAsk() {
  runAsk(askSuggestions[0]);
}

// ---------------------------------------------------------------- sidebar (Arc / Dia style)

function renderSidebar() {
  const space = store.currentSpace;
  const tabs = store.tabsIn();
  const pinned = tabs.filter((t) => t.pinned);
  const today = tabs.filter((t) => !t.pinned);
  const currentId = store.currentTab?.id;

  $('#sidebar').innerHTML = `
    <div class="sb-head">
      <button class="sb-space" data-action="space-switcher">
        <span class="sb-space-emoji">${esc(space.emoji)}</span><strong>${esc(space.name)}</strong>${ICON.chevron}
      </button>
      <button class="sb-icon" data-action="close-sidebar" aria-label="サイドバーを閉じる">${ICON.sidebar}</button>
    </div>

    ${
      pinned.length
        ? `<div class="sb-pins">${pinned
            .map((t) => `<button class="sb-pin ${t.id === currentId ? 'active' : ''}" data-action="open-tab" data-id="${t.id}" data-menu="tab" title="${esc(t.title)}">${favicon(t.url, 22)}</button>`)
            .join('')}</div>`
        : ''
    }

    <div class="sb-tabs">
      ${today
        .map(
          (t) => `<div class="sb-tab ${t.id === currentId ? 'active' : ''}">
            <button class="sb-tab-main" data-action="open-tab" data-id="${t.id}" data-menu="tab">${favicon(t.url, 18)}<span>${esc(t.title)}</span></button>
            <button class="sb-tab-close" data-action="close-tab" data-id="${t.id}" aria-label="閉じる">${ICON.x}</button>
          </div>`
        )
        .join('')}
      <button class="sb-new" data-action="command">${ICON.plus}<span>新しいタブ</span></button>
      ${pinned.length || today.length ? '' : '<p class="sb-empty">タブを長押しすると、ピン留めや移動ができます。</p>'}
    </div>

    <div class="sb-foot">
      <button class="sb-icon" data-action="archive" aria-label="アーカイブ">${ICON.archive}</button>
      <div class="sb-spaces">
        ${store.state.spaces
          .map(
            (s) => `<button class="sb-dot ${s.id === space.id ? 'active' : ''}" data-action="space" data-id="${s.id}" aria-label="${esc(s.name)}"
              style="--c1:${THEMES[s.theme]?.[0]}">${esc(s.emoji)}</button>`
          )
          .join('')}
        <button class="sb-dot add" data-action="new-space" aria-label="スペースを追加">${ICON.plus}</button>
      </div>
      <button class="sb-icon" data-action="settings" aria-label="設定">${ICON.settings}</button>
    </div>`;
}

function setSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
}

/** Swipe in from the left edge to open, swipe left on the sidebar to close. */
function enableSidebarGestures() {
  let start = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const open = document.body.classList.contains('sidebar-open');
    if (layers.length) return;
    if ((!open && t.clientX < 28) || (open && e.target.closest('.sidebar, .sb-scrim'))) {
      start = { x: t.clientX, y: t.clientY, open };
    }
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (!start.open && dx > 0) setSidebar(true);
      if (start.open && dx < 0) setSidebar(false);
    }
    start = null;
  }, { passive: true });
}

function onAppClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = el.dataset.id;
  const inSidebar = !!el.closest('.sidebar');
  switch (el.dataset.action) {
    case 'command':
      if (inSidebar) setSidebar(false);
      openCommandBar();
      break;
    case 'assistant':
      openAssistant();
      break;
    case 'settings':
      openSettings();
      break;
    case 'archive':
      openArchive();
      break;
    case 'sidebar':
      setSidebar(true);
      break;
    case 'close-sidebar':
      setSidebar(false);
      break;
    case 'space-switcher':
      spaceSwitcher();
      break;
    case 'space':
      if (id === store.state.currentSpaceId) spaceMenu(store.currentSpace);
      else store.switchSpace(id);
      break;
    case 'new-space':
      openSpaceEditor();
      break;
    case 'open-tab': {
      const tab = store.findTab(id);
      if (!tab) break;
      if (inSidebar) setSidebar(false);
      openTab(tab);
      break;
    }
    case 'tab-menu': {
      const tab = store.findTab(id);
      if (tab) tabMenu(tab);
      break;
    }
    case 'close-tab': {
      const tab = store.findTab(id);
      if (tab) store.closeTab(tab);
      break;
    }
    case 'close-all':
      if (confirm('ピン留め以外のタブをすべてアーカイブしますか？')) store.closeAllUnpinned();
      break;
    case 'quick':
      openAssistant({ skill: el.dataset.prompt, scope: 'tab' });
      break;
    case 'bookmark': {
      const bookmark = store.state.bookmarks.find((b) => b.id === id);
      if (bookmark) openURL(bookmark.url, bookmark.title);
      break;
    }
    case 'add-bookmark':
      addBookmarkMenu();
      break;
    case 'attach':
      pickTabs();
      break;
    case 'ask-mode':
      askDraft.mode = el.dataset.mode;
      updateAskUI();
      $('.ask-input')?.focus();
      break;
    case 'ask-suggest':
      runAsk(askSuggestions[Number(el.dataset.i)]);
      break;
    case 'detach':
      askDraft.tabIds = askDraft.tabIds.filter((t) => t !== id);
      renderHome();
      break;
    case 'dismiss-install':
      localStorage.setItem('kumo.installHintDismissed', '1');
      renderHome();
      break;
  }
}

/** Long-press on a pinned tile, sidebar tab or bookmark opens its menu instead of the site. */
function enableLongPress() {
  let timer = null;
  let fired = false;
  app.addEventListener('touchstart', (e) => {
    const el = e.target.closest('[data-menu]');
    if (!el) return;
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      if (el.dataset.menu === 'bookmark') {
        bookmarkMenu(el.dataset.id);
      } else {
        const tab = store.findTab(el.dataset.id);
        if (tab) tabMenu(tab);
      }
    }, 500);
  }, { passive: true });
  const cancel = () => clearTimeout(timer);
  app.addEventListener('touchend', cancel);
  app.addEventListener('touchmove', cancel, { passive: true });
  app.addEventListener('click', (e) => {
    if (fired && e.target.closest('[data-menu]')) {
      e.stopImmediatePropagation();
      e.preventDefault();
      fired = false;
    }
  }, true);
  app.addEventListener('contextmenu', (e) => {
    if (e.target.closest('[data-menu]')) e.preventDefault();
  });
}

function enableSpaceSwipe(el) {
  let start = null;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    // Touches near the left edge belong to the sidebar gesture.
    start = t.clientX < 28 ? null : { x: t.clientX, y: t.clientY };
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) {
      el.classList.add(dx < 0 ? 'slide-left' : 'slide-right');
      setTimeout(() => el.classList.remove('slide-left', 'slide-right'), 300);
      store.switchSpaceBy(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
}

function tabMenu(tab) {
  const others = store.state.spaces.filter((s) => s.id !== tab.spaceId);
  const bookmarked = store.isBookmarked(tab.url);
  actionSheet(tab.title, [
    { label: 'AIにこのページについて聞く', run: () => { store.useTab(tab); openAssistant({ scope: 'tab' }); } },
    { label: tab.pinned ? 'ピン留めを外す' : 'ピン留めする', run: () => store.togglePin(tab) },
    {
      label: bookmarked ? 'ブックマークから外す' : 'ブックマークバーに追加',
      run: () => {
        if (bookmarked) store.removeBookmark(store.state.bookmarks.find((b) => b.url === tab.url).id);
        else store.addBookmark(tab.url, tab.title);
      },
    },
    { label: '名前を変更', run: () => { const t = prompt('タブの名前', tab.title); if (t !== null) store.renameTab(tab, t); } },
    ...(others.length ? [{ label: '別のスペースへ移動', run: () => actionSheet('移動先', others.map((s) => ({ label: `${s.emoji} ${s.name}`, run: () => store.moveTab(tab, s.id) }))) }] : []),
    { label: 'リンクをコピー', run: () => navigator.clipboard?.writeText(tab.url).then(() => toast('コピーしました')) },
    { label: '閉じる（アーカイブへ）', destructive: true, run: () => store.closeTab(tab) },
  ]);
}

function bookmarkMenu(id) {
  const bookmark = store.state.bookmarks.find((b) => b.id === id);
  if (!bookmark) return;
  const index = store.state.bookmarks.indexOf(bookmark);
  actionSheet(bookmark.title, [
    { label: '名前を変更', run: () => { const t = prompt('ブックマークの名前', bookmark.title); if (t !== null) store.renameBookmark(id, t); } },
    ...(index > 0 ? [{ label: '左へ移動', run: () => store.moveBookmark(id, -1) }] : []),
    ...(index < store.state.bookmarks.length - 1 ? [{ label: '右へ移動', run: () => store.moveBookmark(id, 1) }] : []),
    { label: 'リンクをコピー', run: () => navigator.clipboard?.writeText(bookmark.url).then(() => toast('コピーしました')) },
    { label: '削除', destructive: true, run: () => store.removeBookmark(id) },
  ]);
}

function addBookmarkMenu() {
  const current = store.currentTab;
  const fromURL = () => {
    const raw = prompt('ブックマークするURL', 'https://');
    const url = raw && parseURL(raw);
    if (!url) return raw && toast('URLが正しくありません');
    const title = prompt('名前', titleFromURL(url).replace(/^🔎 /, ''));
    store.addBookmark(url, title || undefined);
  };
  if (!current || store.isBookmarked(current.url)) return fromURL();
  actionSheet('ブックマークを追加', [
    { label: `閲覧中のタブ「${current.title}」`, run: () => store.addBookmark(current.url, current.title) },
    { label: 'URLを入力して追加', run: fromURL },
  ]);
}

function spaceSwitcher() {
  const { spaces, currentSpaceId } = store.state;
  actionSheet('スペース', [
    ...spaces.map((s) => ({ label: `${s.id === currentSpaceId ? '✓ ' : ''}${s.emoji} ${s.name}`, run: () => store.switchSpace(s.id) })),
    { label: '＋ 新しいスペース', run: () => openSpaceEditor() },
    { label: 'このスペースを編集', run: () => spaceMenu(store.currentSpace) },
  ]);
}

function spaceMenu(space) {
  actionSheet(`${space.emoji} ${space.name}`, [
    { label: 'スペースを編集', run: () => openSpaceEditor(space) },
    ...(store.state.spaces.length > 1
      ? [{ label: 'スペースを削除', destructive: true, run: () => { if (confirm(`「${space.name}」を削除しますか？タブはアーカイブに移動します。`)) store.deleteSpace(space); } }]
      : []),
  ]);
}

/** Choose tabs to attach to the home ask box. */
function pickTabs() {
  const tabs = store.tabsIn();
  if (!tabs.length) return toast('このスペースにはまだタブがありません');
  const selected = new Set(askDraft.tabIds);
  const el = pushLayer(
    'sheet-layer',
    `<div class="sheet list-sheet">
      <div class="chat-head"><span></span><strong>タブを追加</strong><button class="text-btn strong" data-done>完了</button></div>
      <div class="archive-list">${tabs
        .map((t) => `<button class="cmd-row pick-row" data-id="${t.id}">${favicon(t.url, 20)}<span><strong>${esc(t.title)}</strong><small>${esc(hostOf(t.url))}</small></span><i class="check">${ICON.check}</i></button>`)
        .join('')}</div>
    </div>`
  );
  const sync = () => el.querySelectorAll('.pick-row').forEach((r) => r.classList.toggle('picked', selected.has(r.dataset.id)));
  el.querySelectorAll('.pick-row').forEach((row) =>
    row.addEventListener('click', () => {
      selected.has(row.dataset.id) ? selected.delete(row.dataset.id) : selected.add(row.dataset.id);
      sync();
    })
  );
  $('[data-done]', el).addEventListener('click', () => {
    askDraft.tabIds = tabs.filter((t) => selected.has(t.id)).map((t) => t.id);
    popLayer();
    renderHome();
  });
  sync();
}

// ---------------------------------------------------------------- command bar (smart address bar)

function openCommandBar(initial = '') {
  const el = pushLayer(
    'command-layer',
    `<div class="command">
      <form class="command-head">
        <label class="command-field">${ICON.search}
          <input type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder="検索、URL、またはAIに質問" value="${esc(initial)}">
        </label>
        <button type="button" class="text-btn" data-close>キャンセル</button>
      </form>
      <div class="command-list"></div>
    </div>`
  );
  const input = $('input', el);
  const list = $('.command-list', el);
  let suggestions = [];

  const update = () => {
    const q = input.value.trim();
    suggestions = buildSuggestions(q);
    if (!q) {
      const recent = store.tabsIn().slice(0, 6);
      list.innerHTML = `
        <button class="cmd-row" data-paste>${ICON.clipboard}<span><strong>コピーしたURLを開く・AIに聞く</strong><small>Safariで見ているページのリンクをコピーしてからタップ</small></span></button>
        ${recent.length ? `<div class="cmd-section">このスペースのタブ</div>` : ''}
        ${recent.map((t) => `<button class="cmd-row" data-tab="${t.id}">${favicon(t.url, 20)}<span><strong>${esc(t.title)}</strong><small>${esc(hostOf(t.url))}</small></span></button>`).join('')}
        <p class="cmd-tip">✨「?」で終わる文や「〜を教えて」はAIへの質問として扱います</p>`;
      return;
    }
    list.innerHTML = suggestions
      .map(
        (s, i) => `<button class="cmd-row ${s.kind === 'ask' ? 'ask' : ''}" data-i="${i}">${s.icon}<span><strong>${esc(s.title)}</strong><small>${esc(s.subtitle)}</small></span></button>`
      )
      .join('');
  };

  const run = (s) => {
    popLayer();
    if (s.kind === 'open') openURL(s.url);
    else if (s.kind === 'search') openURL(searchURL(s.query));
    else if (s.kind === 'ask') setTimeout(() => openAssistant({ question: s.query }), 260);
    else if (s.kind === 'tab') openTab(s.tab);
  };

  input.addEventListener('input', update);
  $('form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    if (suggestions[0]) run(suggestions[0]);
  });
  $('[data-close]', el).addEventListener('click', popLayer);
  list.addEventListener('click', async (e) => {
    const row = e.target.closest('.cmd-row');
    if (!row) return;
    if (row.dataset.i) return run(suggestions[Number(row.dataset.i)]);
    if (row.dataset.tab) {
      const tab = store.findTab(row.dataset.tab);
      if (tab) run({ kind: 'tab', tab });
      return;
    }
    if (row.hasAttribute('data-paste')) {
      try {
        const text = (await navigator.clipboard.readText()).trim();
        if (!text) return toast('クリップボードが空です');
        input.value = text;
        update();
        const url = parseURL(text);
        if (url) {
          store.touchTab(url);
          popLayer();
          toast('タブに追加しました。AIで要約できます');
        }
      } catch {
        toast('クリップボードを読めませんでした');
      }
    }
  });
  update();
  setTimeout(() => input.focus(), 50);
}

function buildSuggestions(q) {
  if (!q) return [];
  const items = [];
  const url = parseURL(q);
  if (url) items.push({ kind: 'open', url, icon: ICON.globe, title: url, subtitle: 'サイトを開く' });
  const engine = (ENGINES[store.settings.engine] || ENGINES.google).name;
  const search = { kind: 'search', query: q, icon: ICON.search, title: q, subtitle: `${engine}で検索` };
  const ask = { kind: 'ask', query: q, icon: ICON.sparkles, title: q, subtitle: 'Kumo AIに聞く' };
  items.push(...(looksLikeQuestion(q) ? [ask, search] : [search, ask]));
  const lower = q.toLowerCase();
  store.tabsIn()
    .filter((t) => t.title.toLowerCase().includes(lower) || t.url.toLowerCase().includes(lower))
    .slice(0, 5)
    .forEach((tab) => items.push({ kind: 'tab', tab, icon: favicon(tab.url, 20), title: tab.title, subtitle: `タブに切り替え · ${hostOf(tab.url)}` }));
  return items;
}

// ---------------------------------------------------------------- AI assistant (Dia-style chat with tabs)

const SKILLS = {
  要約: 'このページを3〜5行で要約してください。',
  要点: 'このページの重要なポイントを箇条書きで5つ挙げてください。',
  翻訳: 'このページの本文を自然な日本語に翻訳してください。長い場合は主要部分だけで構いません。',
  やさしく: 'このページの内容を、専門知識がない人にもわかるようにやさしく説明してください。',
  注意点: 'このページの主張について、疑問点・注意点・別の視点を挙げてください。',
  比較: '開いているタブの内容を比較して、違いと共通点を表にまとめてください。',
};

const chat = {
  conversation: null,
  items: [], // { role, text, status, sources: Map, error }
  controller: null,
  scope: null, // 'tab' | 'space' | 'picked' | 'none'
  pickedIds: [], // tabs attached from the home ask box
  el: null,
};

function defaultScope() {
  return store.currentTab ? 'tab' : 'none';
}

function pickedTabs() {
  return chat.pickedIds.map((id) => store.findTab(id)).filter(Boolean);
}

function openAssistant({ question, skill, scope, tabIds } = {}) {
  if (tabIds?.length) {
    chat.pickedIds = tabIds;
    scope = 'picked';
  }
  chat.scope = scope || chat.scope || defaultScope();
  if (chat.scope === 'tab' && !store.currentTab) chat.scope = 'none';
  if (chat.scope === 'picked' && !pickedTabs().length) chat.scope = defaultScope();
  chat.el = pushLayer(
    'sheet-layer',
    `<div class="sheet chat">
      <div class="grabber"></div>
      <div class="chat-head">
        <button class="icon-btn plain" data-new aria-label="新しいチャット">${ICON.compose}</button>
        <strong>${ICON.sparkles} Kumo AI</strong>
        <button class="text-btn" data-close>閉じる</button>
      </div>
      <div class="segmented" role="tablist"></div>
      <div class="chat-scroll"><div class="chat-items"></div></div>
      <div class="skills">${Object.keys(SKILLS).map((k) => `<button data-skill="${k}">${k}</button>`).join('')}</div>
      <form class="chat-input">
        <textarea rows="1" enterkeyhint="send" placeholder="質問を入力…"></textarea>
        <button type="submit" class="send" aria-label="送信">${ICON.send}</button>
      </form>
    </div>`,
    { onClose: () => (chat.el = null) }
  );
  const el = chat.el;
  const textarea = $('textarea', el);

  $('[data-close]', el).addEventListener('click', popLayer);
  $('[data-new]', el).addEventListener('click', () => {
    chat.controller?.abort();
    chat.conversation = null;
    chat.items = [];
    renderChat();
  });
  $('.segmented', el).addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    if (b.dataset.scope === 'tab' && !store.currentTab) return toast('閲覧中のタブがありません');
    chat.scope = b.dataset.scope;
    renderChat();
  });
  el.querySelectorAll('[data-skill]').forEach((b) =>
    b.addEventListener('click', () => {
      const name = b.dataset.skill;
      if (name === '比較') chat.scope = 'space';
      else if (chat.scope === 'none' && store.currentTab) chat.scope = 'tab';
      sendChat(SKILLS[name]);
    })
  );
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault();
      $('form', el).requestSubmit();
    }
  });
  $('form', el).addEventListener('submit', (e) => {
    e.preventDefault();
    if (chat.controller) {
      chat.controller.abort();
      return;
    }
    const text = textarea.value.trim();
    if (!text) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    sendChat(text);
  });

  renderChat();
  if (question) sendChat(question);
  else if (skill) sendChat(SKILLS[skill]);
}

function contextFor(scope) {
  if (scope === 'tab' && store.currentTab) {
    const t = store.currentTab;
    return `[閲覧中のタブ]\nタイトル: ${t.title}\nURL: ${t.url}`;
  }
  if (scope === 'picked' && pickedTabs().length) {
    return `[ユーザーが添付したタブ]\n${pickedTabs().map((t, i) => `${i + 1}. ${t.title} — ${t.url}`).join('\n')}`;
  }
  if (scope === 'space') {
    const tabs = store.tabsIn();
    if (!tabs.length) return '';
    return `[このスペースで開いているタブ]\n${tabs.map((t, i) => `${i + 1}. ${t.title} — ${t.url}`).join('\n')}`;
  }
  return '';
}

async function sendChat(text) {
  if (chat.controller) return;
  const { apiKey, model, effort, webTools } = store.settings;
  chat.items.push({ role: 'user', text });
  if (!apiKey) {
    chat.items.push({ role: 'assistant', text: '', error: '設定（右上のボタン）で Anthropic の APIキー を登録してください。' });
    renderChat();
    return;
  }
  chat.conversation ||= new Conversation({ webTools });
  const reply = { role: 'assistant', text: '', status: '考えています…', sources: new Map(), error: null };
  chat.items.push(reply);
  chat.controller = new AbortController();
  renderChat();

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderLastReply(); });
  };

  try {
    await chat.conversation.send({
      text,
      context: contextFor(chat.scope),
      settings: { apiKey, model, effort },
      signal: chat.controller.signal,
      onEvent: (ev) => {
        if (ev.type === 'text-start' && reply.text && !reply.text.endsWith('\n')) reply.text += '\n\n';
        if (ev.type === 'text') { reply.text += ev.text; reply.status = null; }
        if (ev.type === 'status') reply.status = ev.text;
        if (ev.type === 'source' && ev.url) {
          const existing = reply.sources.get(ev.url);
          reply.sources.set(ev.url, { title: ev.title || existing?.title || hostOf(ev.url), cited: ev.cited || existing?.cited });
        }
        schedule();
      },
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      reply.error = error instanceof ClaudeError ? error.message : `通信エラー: ${error.message}`;
    } else if (!reply.text) {
      reply.error = '停止しました';
    }
  } finally {
    cancelAnimationFrame(frame);
    reply.status = null;
    chat.controller = null;
    renderChat();
  }
}

function sourcesHTML(sources) {
  const all = [...sources.entries()];
  const cited = all.filter(([, s]) => s.cited);
  const list = (cited.length ? cited : all).slice(0, 6);
  if (!list.length) return '';
  return `<div class="sources">${list
    .map(([url, s]) => `<a href="${esc(url)}" target="_blank" rel="noopener" class="source" data-source="${esc(url)}">${favicon(url, 14)}<span>${esc(s.title)}</span></a>`)
    .join('')}</div>`;
}

function replyHTML(item) {
  if (item.role === 'user') return `<div class="msg user"><div class="bubble">${esc(item.text)}</div></div>`;
  return `<div class="msg assistant">
      ${item.text ? `<div class="md">${renderMarkdown(item.text)}</div>` : ''}
      ${item.status ? `<div class="status"><span class="dots"></span>${esc(item.status)}</div>` : ''}
      ${item.error ? `<div class="error">${esc(item.error)}</div>` : ''}
      ${item.sources ? sourcesHTML(item.sources) : ''}
    </div>`;
}

function renderChat() {
  const el = chat.el;
  if (!el) return;
  const picked = pickedTabs();
  const scopes = [
    ['tab', '閲覧中のタブ'],
    ...(picked.length ? [['picked', `添付 ${picked.length}`]] : []),
    ['space', '全タブ'],
    ['none', 'タブなし'],
  ];
  $('.segmented', el).innerHTML = scopes
    .map(([key, label]) => `<button data-scope="${key}" class="${key === chat.scope ? 'active' : ''}">${label}</button>`)
    .join('');
  const items = $('.chat-items', el);
  if (!chat.items.length) {
    const t = store.currentTab;
    const target =
      chat.scope === 'tab' && t
        ? `「${t.title}」について`
        : chat.scope === 'picked'
          ? `添付した${picked.length}個のタブについて`
          : chat.scope === 'space'
            ? `${store.currentSpace.name}の${store.tabsIn().length}個のタブについて`
            : '何でも';
    items.innerHTML = `<div class="chat-empty">
        <div class="chat-empty-icon">${ICON.sparkles}</div>
        <p><strong>${esc(target)}聞いてください</strong></p>
        <p>ページの要約・翻訳・質問、複数タブの比較、Web検索して調べものもできます。</p>
        ${store.settings.apiKey ? '' : '<p class="warn">先に設定でAPIキーを登録してください</p>'}
      </div>`;
  } else {
    items.innerHTML = chat.items.map(replyHTML).join('');
  }
  el.querySelector('.send').innerHTML = chat.controller ? ICON.stop : ICON.send;
  el.querySelector('.send').classList.toggle('stop', !!chat.controller);
  el.querySelectorAll('[data-skill]').forEach((b) => (b.disabled = !!chat.controller));
  scrollChat();
}

function renderLastReply() {
  if (!chat.el) return;
  const last = $('.chat-items', chat.el).lastElementChild;
  if (last) last.outerHTML = replyHTML(chat.items[chat.items.length - 1]);
  scrollChat();
}

function scrollChat() {
  const scroller = $('.chat-scroll', chat.el);
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

// Links in answers open as tabs so they show up in Kumo.
document.addEventListener('click', (e) => {
  const a = e.target.closest('.md a, a.source');
  if (!a) return;
  e.preventDefault();
  openURL(a.href);
});

// ---------------------------------------------------------------- spaces editor

function openSpaceEditor(space = null) {
  const emojis = ['🏠', '💼', '📚', '🎮', '🛒', '✈️', '🎨', '🍳', '💻', '🎵', '✨', '🌱'];
  let emoji = space?.emoji || '✨';
  let theme = space?.theme || 'grape';
  const el = pushLayer(
    'sheet-layer',
    `<div class="sheet form-sheet">
      <div class="chat-head">
        <button class="text-btn" data-close>キャンセル</button>
        <strong>${space ? 'スペースを編集' : '新しいスペース'}</strong>
        <button class="text-btn strong" data-save>${space ? '保存' : '作成'}</button>
      </div>
      <label class="field"><span>名前</span><input name="name" placeholder="例: 仕事、趣味、勉強" value="${esc(space?.name || '')}"></label>
      <div class="field"><span>アイコン</span><div class="emoji-grid">${emojis.map((e) => `<button data-emoji="${e}">${e}</button>`).join('')}</div></div>
      <div class="field"><span>カラー</span><div class="theme-grid">${Object.entries(THEMES)
        .map(([key, [a, b]]) => `<button data-theme="${key}" style="background:linear-gradient(135deg,${a},${b})" aria-label="${key}"></button>`)
        .join('')}</div></div>
    </div>`
  );
  const sync = () => {
    el.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('active', b.dataset.emoji === emoji));
    el.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
  };
  el.querySelectorAll('[data-emoji]').forEach((b) => b.addEventListener('click', () => { emoji = b.dataset.emoji; sync(); }));
  el.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => { theme = b.dataset.theme; sync(); }));
  $('[data-close]', el).addEventListener('click', popLayer);
  $('[data-save]', el).addEventListener('click', () => {
    const name = $('input[name=name]', el).value;
    if (space) store.updateSpace(space, { name: name.trim() || space.name, emoji, theme });
    else store.addSpace(name, emoji, theme);
    popLayer();
  });
  sync();
}

// ---------------------------------------------------------------- archive

function openArchive() {
  const el = pushLayer(
    'sheet-layer',
    `<div class="sheet list-sheet">
      <div class="chat-head">
        <button class="text-btn destructive" data-clear>すべて削除</button>
        <strong>アーカイブ</strong>
        <button class="text-btn" data-close>閉じる</button>
      </div>
      <div class="archive-list"></div>
    </div>`
  );
  const list = $('.archive-list', el);
  const draw = () => {
    const items = store.state.archived;
    list.innerHTML = items.length
      ? items
          .map(
            (a) => `<button class="cmd-row" data-id="${a.id}">${favicon(a.url, 20)}<span><strong>${esc(a.title)}</strong><small>${esc(hostOf(a.url))} · ${ago(a.archivedAt)}</small></span></button>`
          )
          .join('')
      : `<div class="chat-empty"><p><strong>アーカイブは空です</strong></p><p>閉じたタブや、しばらく使わなかったタブがここに入ります。タップで元に戻せます。</p></div>`;
  };
  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    const item = row && store.state.archived.find((a) => a.id === row.dataset.id);
    if (!item) return;
    store.restore(item);
    popLayer();
    toast('タブに戻しました');
  });
  $('[data-close]', el).addEventListener('click', popLayer);
  $('[data-clear]', el).addEventListener('click', () => {
    if (store.state.archived.length && confirm('アーカイブをすべて削除しますか？')) {
      store.clearArchive();
      draw();
    }
  });
  draw();
}

// ---------------------------------------------------------------- settings

function openSettings() {
  const s = store.settings;
  const option = (value, label, current) => `<option value="${value}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
  const el = pushLayer(
    'sheet-layer',
    `<div class="sheet form-sheet settings">
      <div class="chat-head"><span></span><strong>設定</strong><button class="text-btn strong" data-close>完了</button></div>

      <div class="group-title">Anthropic APIキー</div>
      <div class="group">
        <label class="row"><input name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-..." value="${esc(s.apiKey)}"></label>
      </div>
      <p class="group-note">console.anthropic.com で発行できます。キーはこの端末のKumoの中にだけ保存され、Anthropic以外には送信されません。利用料はキーのアカウントに従量課金されます。</p>

      <div class="group-title">AIアシスタント</div>
      <div class="group">
        <label class="row"><span>モデル</span><select name="model">${MODELS.map((m) => option(m.id, m.label, s.model)).join('')}</select></label>
        <label class="row"><span>考える深さ</span><select name="effort">${EFFORTS.map((e) => option(e.id, e.label, s.effort)).join('')}</select></label>
        <label class="row"><span>Web検索・ページ読み込み</span><input name="webTools" type="checkbox" ${s.webTools ? 'checked' : ''}></label>
      </div>
      <p class="group-note">Web検索をオフにするとページの中身を読めなくなります。変更は「新しいチャット」から反映されます。</p>

      <div class="group-title">ブラウジング</div>
      <div class="group">
        <label class="row"><span>ブックマークバーを表示</span><input name="showBookmarks" type="checkbox" ${s.showBookmarks ? 'checked' : ''}></label>
        <label class="row"><span>検索エンジン</span><select name="engine">${Object.entries(ENGINES).map(([k, e]) => option(k, e.name, s.engine)).join('')}</select></label>
        <label class="row"><span>タブの自動アーカイブ</span><select name="archiveHours">${[[12, '12時間'], [24, '24時間'], [168, '7日間'], [0, 'しない']].map(([v, l]) => option(v, l, s.archiveHours)).join('')}</select></label>
      </div>

      <div class="group-title">データ</div>
      <div class="group">
        <button class="row action" data-export>バックアップを書き出す</button>
        <label class="row action">バックアップから復元<input type="file" accept="application/json,.json" data-import hidden></label>
        <button class="row action destructive" data-reset>すべてのデータを消去</button>
      </div>
      <p class="group-note">Kumo v0.4 · Arc と Dia にインスパイアされたWebブラウザ</p>
    </div>`
  );
  el.querySelectorAll('input[name], select[name]').forEach((input) =>
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : input.name === 'archiveHours' ? Number(input.value) : input.value.trim();
      store.saveSettings({ [input.name]: value });
      if (input.name === 'archiveHours') store.archiveStaleTabs();
      if (input.name === 'apiKey' && value) toast('APIキーを保存しました');
    })
  );
  $('[data-close]', el).addEventListener('click', popLayer);
  $('[data-export]', el).addEventListener('click', async () => {
    const file = new File([store.exportData()], `kumo-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch {}
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  });
  $('[data-import]', el).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importData(await file.text());
      toast('復元しました');
    } catch (error) {
      alert(error.message);
    }
  });
  $('[data-reset]', el).addEventListener('click', () => {
    if (!confirm('タブ・スペース・アーカイブ・APIキーをすべて消去します。よろしいですか？')) return;
    localStorage.clear();
    location.reload();
  });
}

// ---------------------------------------------------------------- boot

store.load();
store.archiveStaleTabs();
store.subscribe(render);
renderShell();
render();
trackViewport();
enableLongPress();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    store.archiveStaleTabs();
    renderHome(); // refresh relative times
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for debugging in the console.
window.kumo = { store, titleFromURL };
