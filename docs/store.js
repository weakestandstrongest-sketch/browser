// Spaces, tabs and the archive, persisted in localStorage.

const STATE_KEY = 'kumo.state.v1';
const SETTINGS_KEY = 'kumo.settings.v1';
const ARCHIVE_LIMIT = 300;

export const THEMES = {
  ocean: ['#337af5', '#4dc7ed'],
  grape: ['#784af0', '#c76bf2'],
  sunset: ['#fa7345', '#fdb84d'],
  forest: ['#1f946b', '#73cc7a'],
  rose: ['#ed4d85', '#fa94a8'],
  midnight: ['#212645', '#4d5480'],
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
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

function defaultState() {
  const home = { id: uid(), name: 'ホーム', emoji: '🏠', theme: 'ocean' };
  return { spaces: [home], currentSpaceId: home.id, tabs: [], archived: [], currentTabBySpace: {} };
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
    console.warn('Kumo: could not save', error);
  }
}

export const store = {
  state: defaultState(),
  settings: { ...DEFAULT_SETTINGS },
  listeners: new Set(),

  load() {
    const saved = read(STATE_KEY);
    if (saved && Array.isArray(saved.spaces) && saved.spaces.length) this.state = { ...defaultState(), ...saved };
    this.settings = { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) };
    if (!this.state.spaces.some((s) => s.id === this.state.currentSpaceId)) {
      this.state.currentSpaceId = this.state.spaces[0].id;
    }
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

  // ---- queries

  get currentSpace() {
    return this.state.spaces.find((s) => s.id === this.state.currentSpaceId) || this.state.spaces[0];
  },

  /** Pinned tabs first, then the most recently used. */
  tabsIn(spaceId = this.state.currentSpaceId) {
    const tabs = this.state.tabs.filter((t) => t.spaceId === spaceId);
    return [
      ...tabs.filter((t) => t.pinned),
      ...tabs.filter((t) => !t.pinned).sort((a, b) => b.lastActive - a.lastActive),
    ];
  },

  get currentTab() {
    const id = this.state.currentTabBySpace[this.state.currentSpaceId];
    return this.state.tabs.find((t) => t.id === id && t.spaceId === this.state.currentSpaceId) || null;
  },

  findTab(id) {
    return this.state.tabs.find((t) => t.id === id) || null;
  },

  // ---- tabs

  /** Adds a tab (or reuses one with the same URL in this space) and marks it as current. */
  touchTab(url, title) {
    const spaceId = this.state.currentSpaceId;
    let tab = this.state.tabs.find((t) => t.spaceId === spaceId && t.url === url);
    if (!tab) {
      tab = { id: uid(), spaceId, url, title: title || titleFromURL(url), pinned: false, createdAt: Date.now(), lastActive: Date.now() };
      this.state.tabs.push(tab);
    }
    tab.lastActive = Date.now();
    this.state.currentTabBySpace[spaceId] = tab.id;
    this.commit();
    return tab;
  },

  useTab(tab) {
    tab.lastActive = Date.now();
    this.state.currentTabBySpace[tab.spaceId] = tab.id;
    this.commit();
  },

  closeTab(tab) {
    this.archive(tab);
    this.state.tabs = this.state.tabs.filter((t) => t.id !== tab.id);
    if (this.state.currentTabBySpace[tab.spaceId] === tab.id) delete this.state.currentTabBySpace[tab.spaceId];
    this.commit();
  },

  togglePin(tab) {
    tab.pinned = !tab.pinned;
    this.commit();
  },

  renameTab(tab, title) {
    tab.title = title.trim() || titleFromURL(tab.url);
    this.commit();
  },

  moveTab(tab, spaceId) {
    if (this.state.currentTabBySpace[tab.spaceId] === tab.id) delete this.state.currentTabBySpace[tab.spaceId];
    tab.spaceId = spaceId;
    this.commit();
  },

  closeAllUnpinned() {
    const spaceId = this.state.currentSpaceId;
    this.state.tabs.filter((t) => t.spaceId === spaceId && !t.pinned).forEach((t) => this.archive(t));
    this.state.tabs = this.state.tabs.filter((t) => t.spaceId !== spaceId || t.pinned);
    if (!this.currentTab) delete this.state.currentTabBySpace[spaceId];
    this.commit();
  },

  // ---- spaces

  switchSpace(id) {
    if (!this.state.spaces.some((s) => s.id === id)) return;
    this.state.currentSpaceId = id;
    this.commit();
  },

  switchSpaceBy(offset) {
    const index = this.state.spaces.findIndex((s) => s.id === this.state.currentSpaceId);
    const next = this.state.spaces[index + offset];
    if (next) this.switchSpace(next.id);
  },

  addSpace(name, emoji, theme) {
    const space = { id: uid(), name: name.trim() || '新しいスペース', emoji, theme };
    this.state.spaces.push(space);
    this.state.currentSpaceId = space.id;
    this.commit();
  },

  updateSpace(space, patch) {
    Object.assign(space, patch);
    this.commit();
  },

  deleteSpace(space) {
    if (this.state.spaces.length < 2) return;
    this.state.tabs.filter((t) => t.spaceId === space.id).forEach((t) => this.archive(t));
    this.state.tabs = this.state.tabs.filter((t) => t.spaceId !== space.id);
    this.state.spaces = this.state.spaces.filter((s) => s.id !== space.id);
    delete this.state.currentTabBySpace[space.id];
    if (this.state.currentSpaceId === space.id) this.state.currentSpaceId = this.state.spaces[0].id;
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
    for (const [spaceId, tabId] of Object.entries(this.state.currentTabBySpace)) {
      if (ids.has(tabId)) delete this.state.currentTabBySpace[spaceId];
    }
    this.commit();
  },

  archive(tab) {
    this.state.archived.unshift({ id: uid(), url: tab.url, title: tab.title, spaceId: tab.spaceId, archivedAt: Date.now() });
    this.state.archived.length = Math.min(this.state.archived.length, ARCHIVE_LIMIT);
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
    return JSON.stringify({ kumo: 1, state: this.state }, null, 2);
  },

  importData(text) {
    const data = JSON.parse(text);
    if (!data || data.kumo !== 1 || !data.state?.spaces?.length) throw new Error('Kumoのバックアップではありません');
    this.state = { ...defaultState(), ...data.state };
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
      if (url.startsWith(engine.url)) return '🔎 ' + (u.searchParams.get('q') || '');
    }
    const path = decodeURIComponent(u.pathname).replace(/\/$/, '');
    return hostOf(url) + (path && path.length < 40 ? path : path ? '/…' : '');
  } catch {
    return url;
  }
}
