// Tabs, bookmarks and the archive, persisted in localStorage.

// Storage keys keep the app's original name (Kumo) so existing data carries over.
const STATE_KEY = 'kumo.state.v1';
const SETTINGS_KEY = 'kumo.settings.v1';
const ARCHIVE_LIMIT = 300;

export const THEMES = {
  ocean: { name: 'オーシャン', colors: ['#4f7cff', '#2ec5f0'] },
  grape: { name: 'グレープ', colors: ['#8b5cf6', '#e879f9'] },
  sunset: { name: 'サンセット', colors: ['#ff6b4a', '#ffb547'] },
  forest: { name: 'フォレスト', colors: ['#10b981', '#a3e635'] },
  rose: { name: 'ローズ', colors: ['#f43f5e', '#fb923c'] },
  midnight: { name: 'ミッドナイト', colors: ['#6366f1', '#64748b'] },
};

export const ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  effort: 'low',
  webTools: true,
  engine: 'google',
  archiveHours: 12,
  showBookmarks: true,
  theme: 'ocean',
  openIn: 'inapp', // 'inapp' (Safari view on top of Orb) | 'safari' (the Safari app)
};

const DEFAULT_BOOKMARKS = [
  ['https://www.google.com/', 'Google'],
  ['https://www.youtube.com/', 'YouTube'],
  ['https://claude.ai/', 'Claude'],
  ['https://chatgpt.com/', 'ChatGPT'],
  ['https://gemini.google.com/', 'Gemini'],
  ['https://github.com/', 'GitHub'],
];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function defaultState() {
  return {
    tabs: [],
    archived: [],
    currentTabId: null,
    bookmarks: DEFAULT_BOOKMARKS.map(([url, title]) => ({ id: uid(), url, title })),
  };
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Orb: could not save', error);
  }
}

/** Data saved by v0.4 and earlier had Arc-style spaces; fold them into one tab list. */
function migrateSpaces(saved, settings) {
  if (!Array.isArray(saved.spaces)) return saved;
  const current = saved.spaces.find((s) => s.id === saved.currentSpaceId) || saved.spaces[0];
  if (current?.theme && !settings.theme) settings.theme = current.theme;
  const seen = new Set();
  const tabs = (saved.tabs || []).filter((t) => !seen.has(t.url) && seen.add(t.url)).map(({ spaceId, ...t }) => t);
  return {
    tabs,
    archived: (saved.archived || []).map(({ spaceId, ...a }) => a),
    currentTabId: saved.currentTabBySpace?.[current?.id] || null,
    bookmarks: saved.bookmarks,
  };
}

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export const store = {
  state: defaultState(),
  settings: { ...DEFAULT_SETTINGS },
  listeners: new Set(),

  load() {
    const savedSettings = read(SETTINGS_KEY) || {};
    const saved = read(STATE_KEY);
    if (saved) {
      const migrated = migrateSpaces(saved, savedSettings);
      this.state = { ...defaultState(), ...defined(migrated) };
      if (migrated !== saved) {
        write(STATE_KEY, this.state);
        write(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...savedSettings });
      }
    }
    this.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    if (!THEMES[this.settings.theme]) this.settings.theme = 'ocean';
  },

  subscribe(fn) {
    this.listeners.add(fn);
  },

  commit() {
    write(STATE_KEY, this.state);
    this.listeners.forEach((fn) => fn());
  },

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    write(SETTINGS_KEY, this.settings);
    this.listeners.forEach((fn) => fn());
  },

  get theme() {
    return THEMES[this.settings.theme] || THEMES.ocean;
  },

  // ---- tabs

  /** Pinned tabs first, then the most recently used. */
  get tabs() {
    const { tabs } = this.state;
    return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned).sort((a, b) => b.lastActive - a.lastActive)];
  },

  get currentTab() {
    return this.findTab(this.state.currentTabId);
  },

  findTab(id) {
    return this.state.tabs.find((t) => t.id === id) || null;
  },

  /** Adds a tab (or reuses one with the same URL) and marks it as current. */
  touchTab(url, title) {
    let tab = this.state.tabs.find((t) => t.url === url);
    if (!tab) {
      tab = { id: uid(), url, title: title || titleFromURL(url), pinned: false, createdAt: Date.now(), lastActive: Date.now() };
      this.state.tabs.push(tab);
    }
    tab.lastActive = Date.now();
    this.state.currentTabId = tab.id;
    this.commit();
    return tab;
  },

  useTab(tab) {
    tab.lastActive = Date.now();
    this.state.currentTabId = tab.id;
    this.commit();
  },

  closeTab(tab) {
    this.archive(tab);
    this.state.tabs = this.state.tabs.filter((t) => t.id !== tab.id);
    if (this.state.currentTabId === tab.id) this.state.currentTabId = null;
    this.commit();
  },

  /**
   * Points the current tab at a page reached inside the Safari view (which Orb can't observe).
   * Pinned tabs keep their URL, so a new tab is made instead.
   */
  navigateCurrent(url) {
    const tab = this.currentTab;
    const existing = this.state.tabs.find((t) => t.url === url);
    if (!tab || tab.pinned || existing) return this.touchTab(url);
    tab.url = url;
    tab.title = titleFromURL(url);
    tab.lastActive = Date.now();
    this.commit();
    return tab;
  },

  togglePin(tab) {
    tab.pinned = !tab.pinned;
    this.commit();
  },

  renameTab(tab, title) {
    tab.title = title.trim() || titleFromURL(tab.url);
    this.commit();
  },

  /** Archives every unpinned tab (Arc's "Clear"). Returns an undo function. */
  archiveAllUnpinned() {
    const removed = this.state.tabs.filter((t) => !t.pinned);
    const entries = removed.map((t) => this.archive(t));
    const previousCurrent = this.state.currentTabId;
    this.state.tabs = this.state.tabs.filter((t) => t.pinned);
    if (!this.currentTab) this.state.currentTabId = null;
    this.commit();
    return {
      count: removed.length,
      undo: () => {
        const ids = new Set(entries.map((e) => e.id));
        this.state.archived = this.state.archived.filter((a) => !ids.has(a.id));
        const open = new Set(this.state.tabs.map((t) => t.url));
        this.state.tabs.push(...removed.filter((t) => !open.has(t.url))); // 消したあとに開き直したタブは二重にしない
        this.state.currentTabId = previousCurrent;
        this.commit();
      },
    };
  },

  // ---- bookmarks (like a desktop bookmarks bar)

  isBookmarked(url) {
    return this.state.bookmarks.some((b) => b.url === url);
  },

  addBookmark(url, title) {
    if (this.isBookmarked(url)) return;
    this.state.bookmarks.push({ id: uid(), url, title: title || titleFromURL(url) });
    this.commit();
  },

  removeBookmark(id) {
    this.state.bookmarks = this.state.bookmarks.filter((b) => b.id !== id);
    this.commit();
  },

  renameBookmark(id, title) {
    const bookmark = this.state.bookmarks.find((b) => b.id === id);
    if (bookmark) bookmark.title = title.trim() || bookmark.title;
    this.commit();
  },

  moveBookmark(id, offset) {
    const list = this.state.bookmarks;
    const from = list.findIndex((b) => b.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(to, 0, list.splice(from, 1)[0]);
    this.commit();
  },

  // ---- archive (Arc-style auto archiving)

  archiveStaleTabs() {
    const hours = Number(this.settings.archiveHours);
    if (!hours) return;
    const cutoff = Date.now() - hours * 3600 * 1000;
    const stale = this.state.tabs.filter((t) => !t.pinned && t.lastActive < cutoff);
    if (!stale.length) return;
    stale.forEach((t) => this.archive(t));
    const ids = new Set(stale.map((t) => t.id));
    this.state.tabs = this.state.tabs.filter((t) => !ids.has(t.id));
    if (ids.has(this.state.currentTabId)) this.state.currentTabId = null;
    this.commit();
  },

  archive(tab) {
    const entry = { id: uid(), url: tab.url, title: tab.title, archivedAt: Date.now() };
    this.state.archived.unshift(entry);
    this.state.archived.length = Math.min(this.state.archived.length, ARCHIVE_LIMIT);
    return entry;
  },

  restore(item) {
    this.state.archived = this.state.archived.filter((a) => a.id !== item.id);
    return this.touchTab(item.url, item.title);
  },

  clearArchive() {
    this.state.archived = [];
    this.commit();
  },

  // ---- backup

  exportData() {
    return JSON.stringify({ orb: 2, state: this.state }, null, 2);
  },

  importData(text) {
    const data = JSON.parse(text);
    if (!data || !(data.orb || data.kumo) || !data.state || !Array.isArray(data.state.tabs)) throw new Error('Orbのバックアップではありません');
    this.state = { ...defaultState(), ...defined(migrateSpaces(data.state, {})) };
    this.commit();
  },
};

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function titleFromURL(url) {
  try {
    const u = new URL(url);
    for (const engine of Object.values(ENGINES)) {
      if (url.startsWith(engine.url)) return u.searchParams.get('q') || engine.name;
    }
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '');
    return hostOf(url) + (path && path.length < 40 ? path : path ? '/…' : '');
  } catch {
    return url;
  }
}
