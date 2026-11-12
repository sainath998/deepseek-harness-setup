/**
 * The agent browser hub: one CDP connection to the Chrome that dsh-browser-cdp (the ego runtime)
 * drives, shared by every viewer. It tracks page tabs and the tab being viewed, streams that tab's
 * screencast to viewers, and replays viewer input — the server-browser model T3 Code uses for its
 * web and mobile clients. Pure Node (global WebSocket), so it runs and tests outside DSH.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { discoverServers } from './servers.js';

const HOME = homedir();
const STATE_DIR = join(process.env.XDG_STATE_HOME || join(HOME, '.local', 'state'), 'ego-lite-linux');
const DATA_DIR = join(process.env.XDG_DATA_HOME || join(HOME, '.local', 'share'), 'ego-lite-linux');
const PROFILE_DIR = process.env.EGO_LINUX_PROFILE || join(DATA_DIR, 'profile');

const SEND_TIMEOUT_MS = 15_000;
// Chromium answers an input event once the renderer handled it; a hidden page never does.
const INPUT_TIMEOUT_MS = 2_500;
// A navigation or new tab this soon after a viewer's input or command is the viewer's own.
const USER_INTENT_MS = 2_000;
// Keep the screencast and the viewport override briefly after the last viewer leaves, so moving the
// view between the sidebar and the floating player does not relayout the page twice.
const STOP_GRACE_MS = 4_000;
const DETACH_GRACE_MS = 15_000;
const SCREENCAST = { format: 'jpeg', quality: 80, maxWidth: 2560, maxHeight: 2560, everyNthFrame: 1 };
const HIDDEN_URL = /^(devtools|chrome-extension|chrome-untrusted|chrome-search):|^chrome:\/\/(?!newtab)/;
const SEARCH_URL = 'https://www.google.com/search?q=';
const SERVER_POLL_MS = 5_000;
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
// Screenshots and picked elements handed to the chat live outside any project, so they never show
// up as repository changes.
export const CAPTURES_DIR = join(process.env.DSH_HOME || join(HOME, '.dsh'), 'agent-browser-captures');
const HIGHLIGHT = {
  showInfo: true,
  showStyles: false,
  contentColor: { r: 77, g: 107, b: 254, a: 0.22 },
  paddingColor: { r: 77, g: 107, b: 254, a: 0.12 },
  borderColor: { r: 77, g: 107, b: 254, a: 0.9 },
  marginColor: { r: 255, g: 155, b: 0, a: 0.12 },
};
// Runs on the picked element in the page: a readable description and a stable-ish selector.
const DESCRIBE_ELEMENT = `function () {
  const el = this;
  const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const part = (node) => {
    if (node.id) return '#' + esc(node.id);
    let s = node.localName;
    const classes = [...node.classList].filter((c) => !/^(css|sc|jsx|_)[-_]|[0-9a-f]{6,}/i.test(c)).slice(0, 2);
    if (classes.length) s += '.' + classes.map(esc).join('.');
    const parent = node.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.localName === node.localName);
      if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
    }
    return s;
  };
  const path = [];
  for (let node = el; node && node.nodeType === 1 && path.length < 5; node = node.parentElement) {
    path.unshift(part(node));
    if (node.id) break;
  }
  const attrs = {};
  for (const name of ['href', 'src', 'alt', 'name', 'type', 'role', 'aria-label', 'placeholder', 'title', 'value']) {
    const v = el.getAttribute && el.getAttribute(name);
    if (v) attrs[name] = String(v).slice(0, 160);
  }
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    tag: el.localName,
    id: el.id || '',
    classes: [...(el.classList || [])].slice(0, 6),
    text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240),
    selector: path.join(' > '),
    attrs,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    style: { color: style.color, background: style.backgroundColor, font: style.fontSize + ' ' + style.fontFamily.split(',')[0] },
  };
}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, timeoutMs = 1500) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

/** The browser-level DevTools WebSocket of the ego Chrome, or null when it is not running. */
export async function discoverEndpoint() {
  if (process.env.EGO_LINUX_CDP_URL) {
    const raw = process.env.EGO_LINUX_CDP_URL;
    if (raw.startsWith('ws')) return raw;
    const version = await fetchJson(new URL('/json/version', raw).href).catch(() => null);
    return version?.webSocketDebuggerUrl ?? null;
  }
  const ports = [];
  const state = await readFile(join(STATE_DIR, 'browser.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (state?.port) ports.push(state.port);
  const portFile = await readFile(join(PROFILE_DIR, 'DevToolsActivePort'), 'utf8').catch(() => '');
  const filePort = Number(portFile.split('\n')[0]);
  if (filePort && !ports.includes(filePort)) ports.push(filePort);
  for (const port of ports) {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`).catch(() => null);
    if (version?.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
  }
  return null;
}

/** The ego CLI (`ego-browser.mjs`) shipped inside dsh-browser-cdp, preferring the given profile. */
export async function findEgoCli(preferredProfile) {
  const root = join(process.env.DSH_HOME || join(HOME, '.dsh'), 'profiles');
  const names = await readdir(root).catch(() => []);
  const ordered = [preferredProfile, 'desktop', ...names].filter((name, i, all) => name && all.indexOf(name) === i);
  for (const name of ordered) {
    const cli = join(root, name, 'node_modules', 'dsh-browser-cdp', 'runtime', 'ego-linux', 'bin', 'ego-browser.mjs');
    if (existsSync(cli)) return cli;
  }
  return null;
}

/** One CDP WebSocket with request/response correlation and an event fan-out. */
class CdpConnection {
  static open(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('CDP connection timed out'));
      }, timeoutMs);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new CdpConnection(socket));
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP connection failed'));
      }, { once: true });
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Set();
    this.closeHandlers = new Set();
    this.closed = false;
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', () => this.shutdown());
    socket.addEventListener('error', () => this.shutdown());
  }

  receive(data) {
    let message;
    try {
      message = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result ?? {});
      return;
    }
    for (const handler of this.eventHandlers) {
      try {
        handler(message.method, message.params ?? {}, message.sessionId);
      } catch (error) {
        console.warn('[agent-browser] CDP event handler failed', error);
      }
    }
  }

  send(method, params = {}, sessionId, timeoutMs = SEND_TIMEOUT_MS) {
    if (this.closed) return Promise.reject(new Error('CDP connection closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`${method}: timed out`), { timeout: true }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  onEvent(handler) {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
  }

  shutdown() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('CDP connection closed'));
    }
    this.pending.clear();
    for (const handler of this.closeHandlers) handler();
  }

  close() {
    try {
      this.socket.close();
    } catch {}
    this.shutdown();
  }
}

/** Ctrl/Cmd editing shortcuts Chromium only performs when the key event names the command. */
function editingCommands(key, modifiers) {
  const modifier = modifiers & 0b0111;
  const mac = process.platform === 'darwin';
  if (modifier !== (mac ? 4 : 2)) return undefined;
  const lower = String(key).toLowerCase();
  if (lower === 'a') return ['selectAll'];
  if (lower === 'c') return ['copy'];
  if (lower === 'x') return ['cut'];
  if (lower === 'z') return [modifiers & 8 ? 'redo' : 'undo'];
  return undefined;
}

const num = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Turn address-bar input into a URL: keep schemes, add https to hosts, search everything else. */
export function normalizeAddress(input) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (/^(https?|file|about|data|chrome):/i.test(text)) return text;
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(text)) return `http://${text}`;
  if (!/\s/.test(text) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`;
  return SEARCH_URL + encodeURIComponent(text);
}

export class BrowserHub {
  constructor({ preferredProfile } = {}) {
    this.preferredProfile = preferredProfile;
    this.conn = null;
    this.connecting = null;
    this.loopRunning = false;
    this.disposed = false;
    this.tabs = new Map();
    this.activeId = null;
    this.session = null;
    this.sessionTask = Promise.resolve();
    this.inputTask = Promise.resolve();
    this.screencasting = false;
    this.castStartedAt = 0;
    this.restartTimer = null;
    this.lastFrame = null;
    this.lastFrameAt = 0;
    this.userIntentUntil = 0;
    this.initializing = false;
    this.viewport = null;
    this.fill = true;
    this.zoom = 1;
    this.servers = [];
    this.serversAt = 0;
    this.serversTask = null;
    this.excludePorts = new Set();
    this.picking = false;
    this.status = { connected: false, launching: false, error: null };
    this.nav = { url: '', title: '', canGoBack: false, canGoForward: false, loading: false };
    this.dialog = null;
    this.eventListeners = new Set();
    this.frameViewers = new Set();
    this.stopAt = 0;
    this.detachAt = 0;
    this.graceTimers = [];
    this.stateTimer = null;
  }

  /* ------------------------------------------------------------- subscriptions */

  /** Receive state/activity/reveal events; keeps the hub connected while any listener exists. */
  addEventListener(listener) {
    this.eventListeners.add(listener);
    listener({ t: 'state', ...this.snapshot() });
    this.ensureLoop();
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /** Receive the viewed tab's frames; starts the screencast while any viewer exists. */
  addFrameViewer(viewer) {
    this.frameViewers.add(viewer);
    this.clearGrace();
    if (this.lastFrame && this.lastFrame.targetId === this.activeId) viewer(this.lastFrame);
    this.ensureLoop();
    this.syncSession();
    return () => {
      this.frameViewers.delete(viewer);
      if (this.frameViewers.size > 0) return;
      this.clearGrace();
      const now = Date.now();
      this.stopAt = now + STOP_GRACE_MS;
      this.detachAt = now + DETACH_GRACE_MS;
      this.graceTimers = [STOP_GRACE_MS, DETACH_GRACE_MS].map((ms) => setTimeout(() => this.syncSession(), ms + 20));
    };
  }

  clearGrace() {
    for (const timer of this.graceTimers) clearTimeout(timer);
    this.graceTimers = [];
    this.stopAt = 0;
    this.detachAt = 0;
  }

  emit(event) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {}
    }
  }

  snapshot() {
    return {
      ...this.status,
      tabs: [...this.tabs.values()].map(({ id, url, title }) => ({ id, url, title })),
      activeId: this.activeId,
      nav: this.nav,
      dialog: this.dialog,
      fill: this.fill,
      zoom: this.zoom,
      servers: this.servers,
    };
  }

  /** Coalesce state broadcasts; tab title churn during a load would otherwise flood viewers. */
  publish() {
    if (this.stateTimer) return;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.emit({ t: 'state', ...this.snapshot() });
    }, 50);
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this.publish();
  }

  markUserIntent() {
    this.userIntentUntil = Date.now() + USER_INTENT_MS;
  }

  userIntent() {
    return Date.now() < this.userIntentUntil;
  }

  /* ----------------------------------------------------------------- connection */

  ensureLoop() {
    if (this.loopRunning || this.disposed) return;
    this.loopRunning = true;
    (async () => {
      let delay = 1000;
      while (!this.disposed && (this.eventListeners.size > 0 || this.frameViewers.size > 0)) {
        if (!this.conn) {
          const ok = await this.connect().catch(() => false);
          delay = ok ? 1000 : Math.min(delay * 1.5, 5000);
        } else if (this.session && this.frameViewers.size > 0) {
          await this.ensureVisible(this.session.id);
        }
        if (this.eventListeners.size > 0 && Date.now() - this.serversAt > SERVER_POLL_MS) this.refreshServers();
        await sleep(this.conn ? 2000 : delay);
      }
      this.loopRunning = false;
      if (this.eventListeners.size === 0 && this.frameViewers.size === 0) this.disconnect();
    })();
  }

  async connect() {
    if (this.conn) return true;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const url = await discoverEndpoint();
        if (!url) {
          this.setStatus({ connected: false, error: null });
          return false;
        }
        const conn = await CdpConnection.open(url);
        this.conn = conn;
        conn.onEvent((method, params, sessionId) => this.onCdpEvent(method, params, sessionId));
        conn.onClose(() => this.onDisconnected(conn));
        this.initializing = true;
        await conn.send('Target.setDiscoverTargets', { discover: true });
        const { targetInfos } = await conn.send('Target.getTargets');
        for (const info of targetInfos) this.upsertTarget(info);
        this.initializing = false;
        if (!this.activeId || !this.tabs.has(this.activeId)) this.activeId = this.pickFallbackTab();
        this.setStatus({ connected: true, error: null });
        this.syncSession();
        return true;
      } catch (error) {
        this.conn?.close();
        this.conn = null;
        this.setStatus({ connected: false, error: error instanceof Error ? error.message : String(error) });
        return false;
      } finally {
        this.connecting = null;
        this.initializing = false;
      }
    })();
    return this.connecting;
  }

  onDisconnected(conn) {
    if (this.conn !== conn) return;
    this.conn = null;
    this.session = null;
    this.screencasting = false;
    this.tabs.clear();
    this.lastFrame = null;
    this.dialog = null;
    this.nav = { url: '', title: '', canGoBack: false, canGoForward: false, loading: false };
    this.setStatus({ connected: false });
    this.ensureLoop();
  }

  disconnect() {
    const conn = this.conn;
    if (!conn) return;
    this.conn = null;
    conn.close();
  }

  dispose() {
    this.disposed = true;
    this.clearGrace();
    clearTimeout(this.stateTimer);
    this.eventListeners.clear();
    this.frameViewers.clear();
    this.disconnect();
  }

  /* -------------------------------------------------------------------- targets */

  pickFallbackTab() {
    const tabs = [...this.tabs.values()];
    return tabs.find((tab) => tab.attached)?.id ?? tabs[0]?.id ?? null;
  }

  upsertTarget(info) {
    if (info.type !== 'page' || HIDDEN_URL.test(info.url)) {
      if (this.tabs.delete(info.targetId)) this.onTabRemoved(info.targetId);
      return;
    }
    const previous = this.tabs.get(info.targetId);
    const tab = { id: info.targetId, url: info.url, title: info.title, attached: info.attached };
    this.tabs.set(info.targetId, tab);
    this.publish();
    if (this.initializing) return;
    const agent = !this.userIntent();
    if (!previous) {
      // A tab nobody here asked for was opened by the agent: follow it.
      if (agent || !this.activeId) this.activate(info.targetId, agent ? 'agent' : 'user');
      if (agent) this.emit({ t: 'activity', by: 'agent', kind: 'open', targetId: info.targetId, url: info.url });
      return;
    }
    if (previous.url !== info.url && agent && !/^about:blank/.test(info.url)) {
      if (info.targetId !== this.activeId) this.activate(info.targetId, 'agent');
      this.emit({ t: 'activity', by: 'agent', kind: 'navigate', targetId: info.targetId, url: info.url });
    }
    if (info.targetId === this.activeId) {
      this.nav = { ...this.nav, url: info.url, title: info.title };
    }
  }

  onTabRemoved(targetId) {
    this.publish();
    if (targetId !== this.activeId) return;
    this.activeId = this.pickFallbackTab();
    this.lastFrame = null;
    this.syncSession();
  }

  activate(targetId, by) {
    if (!this.tabs.has(targetId) || targetId === this.activeId) return;
    this.activeId = targetId;
    this.lastFrame = null;
    this.dialog = null;
    const tab = this.tabs.get(targetId);
    this.nav = { url: tab.url, title: tab.title, canGoBack: false, canGoForward: false, loading: false };
    this.publish();
    // The agent's runtime prefers the active tab, so the tab the user picks is the one it acts on.
    if (by === 'user') this.conn?.send('Target.activateTarget', { targetId }).catch(() => {});
    this.syncSession();
  }

  /* -------------------------------------------------------------------- session */

  /** Attach to the viewed tab while anything needs it; run the screencast while viewers exist. */
  syncSession() {
    this.sessionTask = this.sessionTask.then(() => this.reconcileSession()).catch((error) => {
      console.warn('[agent-browser] session sync failed', error);
    });
    return this.sessionTask;
  }

  async reconcileSession() {
    const conn = this.conn;
    if (!conn) return;
    const viewers = this.frameViewers.size > 0;
    const wantAttached = this.activeId !== null && (viewers || this.detachPending());
    if (this.session && (!wantAttached || this.session.targetId !== this.activeId)) {
      const old = this.session;
      this.session = null;
      this.screencasting = false;
      await conn.send('Target.detachFromTarget', { sessionId: old.id }).catch(() => {});
    }
    if (!wantAttached) return;
    if (!this.session) {
      const targetId = this.activeId;
      const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
      if (this.conn !== conn || this.activeId !== targetId) {
        await conn.send('Target.detachFromTarget', { sessionId }).catch(() => {});
        return this.reconcileSession();
      }
      this.session = { id: sessionId, targetId };
      await conn.send('Page.enable', {}, sessionId).catch(() => {});
      await this.applyViewport().catch(() => {});
      await this.ensureVisible(sessionId);
      await this.refreshHistory();
    }
    const wantCast = viewers || this.stopPending();
    if (wantCast && !this.screencasting) {
      this.screencasting = true;
      this.castStartedAt = Date.now();
      await conn.send('Page.startScreencast', SCREENCAST, this.session.id);
      // An idle page may not paint; seed new viewers with one capture.
      setTimeout(() => this.seedFrame(), 400);
    } else if (!wantCast && this.screencasting) {
      this.screencasting = false;
      await conn.send('Page.stopScreencast', {}, this.session.id).catch(() => {});
    }
  }

  stopPending() {
    return Date.now() < this.stopAt;
  }

  detachPending() {
    return Date.now() < this.detachAt;
  }

  /**
   * A navigation that swaps the page into another renderer process silently ends its screencast;
   * restart it once the new document commits, and seed a frame in case the page is idle.
   */
  restartScreencast() {
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.sessionTask = this.sessionTask.then(async () => {
        const session = this.session;
        const conn = this.conn;
        if (!session || !conn || !this.screencasting) return;
        await conn.send('Page.stopScreencast', {}, session.id).catch(() => {});
        if (this.session !== session || !this.screencasting) return;
        this.castStartedAt = Date.now();
        await conn.send('Page.startScreencast', SCREENCAST, session.id).catch(() => {});
        setTimeout(() => this.seedFrame(), 500);
      }).catch(() => {});
    }, 120);
  }

  /**
   * A headed Chrome renders only the front tab of each window: a hidden tab paints no frames and
   * never acknowledges input. Bring the tab being viewed to the front of its window.
   */
  async ensureVisible(sessionId) {
    const conn = this.conn;
    if (!conn) return;
    try {
      const { result } = await conn.send('Runtime.evaluate', { expression: 'document.visibilityState', returnByValue: true }, sessionId, 3000);
      if (result?.value === 'hidden') await conn.send('Page.bringToFront', {}, sessionId, 3000);
    } catch {}
  }

  async seedFrame() {
    const session = this.session;
    if (!session || !this.conn || !this.screencasting) return;
    if (this.lastFrame?.targetId === session.targetId && this.lastFrameAt > this.castStartedAt) return;
    try {
      const metrics = await this.conn.send('Page.getLayoutMetrics', {}, session.id);
      const shot = await this.conn.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, session.id);
      if (this.session !== session || (this.lastFrame?.targetId === session.targetId && this.lastFrameAt > this.castStartedAt)) return;
      const viewport = metrics.cssVisualViewport ?? metrics.visualViewport ?? {};
      this.broadcastFrame({
        t: 'frame',
        targetId: session.targetId,
        data: shot.data,
        width: Math.round(num(viewport.clientWidth, 0)),
        height: Math.round(num(viewport.clientHeight, 0)),
      });
    } catch {}
  }

  broadcastFrame(frame) {
    this.lastFrame = frame;
    this.lastFrameAt = Date.now();
    for (const viewer of this.frameViewers) {
      try {
        viewer(frame);
      } catch {}
    }
  }

  async refreshHistory() {
    const session = this.session;
    if (!session || !this.conn) return;
    try {
      const history = await this.conn.send('Page.getNavigationHistory', {}, session.id);
      if (this.session !== session) return;
      const entry = history.entries[history.currentIndex];
      this.nav = {
        ...this.nav,
        url: entry?.url ?? this.nav.url,
        title: entry?.title || this.nav.title,
        canGoBack: history.currentIndex > 0,
        canGoForward: history.currentIndex < history.entries.length - 1,
      };
      this.publish();
    } catch {}
  }

  async applyViewport() {
    const session = this.session;
    if (!session || !this.conn) return;
    if (this.fill && this.viewport) {
      // Zoom like a browser: the page lays out in a smaller (or larger) CSS viewport and renders at
      // the zoom as its device scale, so frames still fill the panel pixel for pixel.
      const zoom = this.zoom;
      await this.conn.send('Emulation.setDeviceMetricsOverride', {
        width: Math.max(120, Math.round(this.viewport.width / zoom)),
        height: Math.max(120, Math.round(this.viewport.height / zoom)),
        deviceScaleFactor: zoom === 1 ? 0 : zoom,
        mobile: false,
      }, session.id);
    } else {
      await this.conn.send('Emulation.clearDeviceMetricsOverride', {}, session.id);
    }
  }

  onCdpEvent(method, params, sessionId) {
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      this.upsertTarget(params.targetInfo);
      return;
    }
    if (method === 'Target.targetDestroyed') {
      if (this.tabs.delete(params.targetId)) this.onTabRemoved(params.targetId);
      return;
    }
    if (method === 'Target.detachedFromTarget') {
      if (this.session?.id === params.sessionId) {
        this.session = null;
        this.screencasting = false;
        this.syncSession();
      }
      return;
    }
    if (!sessionId || sessionId !== this.session?.id) return;
    switch (method) {
      case 'Page.screencastFrame': {
        this.conn?.send('Page.screencastFrameAck', { sessionId: params.sessionId }, sessionId).catch(() => {});
        const meta = params.metadata ?? {};
        this.broadcastFrame({
          t: 'frame',
          targetId: this.session.targetId,
          data: params.data,
          width: Math.round(num(meta.deviceWidth)),
          height: Math.round(num(meta.deviceHeight)),
        });
        return;
      }
      case 'Page.frameStartedLoading':
        this.nav = { ...this.nav, loading: true };
        this.publish();
        return;
      case 'Page.frameStoppedLoading':
      case 'Page.loadEventFired':
        this.nav = { ...this.nav, loading: false };
        this.publish();
        this.refreshHistory();
        return;
      case 'Page.frameNavigated':
        if (!params.frame?.parentId) {
          this.refreshHistory();
          this.restartScreencast();
        }
        return;
      case 'Page.navigatedWithinDocument':
        this.refreshHistory();
        return;
      case 'Page.javascriptDialogOpening':
        this.dialog = { type: params.type, message: params.message, defaultPrompt: params.defaultPrompt ?? '' };
        this.publish();
        return;
      case 'Page.javascriptDialogClosed':
        this.dialog = null;
        this.publish();
        return;
      default:
    }
  }

  async withSession() {
    if (!this.conn) throw new Error('The browser is not running');
    if (!this.activeId) throw new Error('No tab is open');
    if (!this.session || this.session.targetId !== this.activeId) await this.syncSession();
    if (this.session && this.session.targetId === this.activeId) return this.session;
    // Nothing views the tab (a command from the agent tool); attach for this call only.
    const conn = this.conn;
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId: this.activeId, flatten: true });
    setTimeout(() => conn.send('Target.detachFromTarget', { sessionId }).catch(() => {}), 5000);
    return { id: sessionId, targetId: this.activeId };
  }

  /* ---------------------------------------------------------------------- input */

  /** Replay a batch of viewer input in order; batches queue behind each other. */
  input(events) {
    if (!Array.isArray(events) || events.length === 0) return Promise.resolve();
    this.markUserIntent();
    this.inputTask = this.inputTask.then(async () => {
      const conn = this.conn;
      const session = this.session;
      if (!conn || !session || session.targetId !== this.activeId) return;
      for (const event of events.slice(0, 200)) {
        try {
          await this.dispatch(conn, session.id, event);
        } catch (error) {
          if (!error?.timeout) continue;
          // The page stopped answering input, most likely hidden behind another tab.
          await this.ensureVisible(session.id);
        }
      }
    });
    return this.inputTask;
  }

  async dispatch(conn, sessionId, event) {
    const modifiers = num(event.modifiers) & 0b1111;
    switch (event.type) {
      case 'mouse': {
        const type = event.action === 'down' ? 'mousePressed' : event.action === 'up' ? 'mouseReleased' : 'mouseMoved';
        const button = ['none', 'left', 'middle', 'right', 'back', 'forward'].includes(event.button) ? event.button : 'none';
        await conn.send('Input.dispatchMouseEvent', {
          type,
          x: num(event.x),
          y: num(event.y),
          button,
          buttons: num(event.buttons),
          clickCount: num(event.clickCount, type === 'mouseMoved' ? 0 : 1),
          modifiers,
        }, sessionId, INPUT_TIMEOUT_MS);
        return;
      }
      case 'wheel':
        await conn.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: num(event.x),
          y: num(event.y),
          deltaX: num(event.deltaX),
          deltaY: num(event.deltaY),
          modifiers,
        }, sessionId, INPUT_TIMEOUT_MS);
        return;
      case 'key': {
        const key = typeof event.key === 'string' ? event.key : '';
        const code = typeof event.code === 'string' ? event.code : '';
        const keyCode = num(event.keyCode, key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
        if (event.action === 'up') {
          await conn.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: keyCode }, sessionId, INPUT_TIMEOUT_MS);
          return;
        }
        const text = typeof event.text === 'string' && event.text !== '' ? event.text : undefined;
        const commands = editingCommands(key, modifiers);
        await conn.send('Input.dispatchKeyEvent', {
          type: text ? 'keyDown' : 'rawKeyDown',
          key,
          code,
          modifiers,
          windowsVirtualKeyCode: keyCode,
          ...(text ? { text, unmodifiedText: text } : {}),
          ...(commands ? { commands } : {}),
        }, sessionId, INPUT_TIMEOUT_MS);
        return;
      }
      case 'text':
        if (typeof event.text === 'string' && event.text !== '') {
          await conn.send('Input.insertText', { text: event.text.slice(0, 20_000) }, sessionId, INPUT_TIMEOUT_MS);
        }
        return;
      default:
    }
  }

  /* ------------------------------------------------------------------- commands */

  async command(op, args = {}) {
    if (!['resize', 'setFill', 'inspect', 'servers', 'find', 'findEnd', 'capture', 'pickEnd'].includes(op)) this.markUserIntent();
    switch (op) {
      case 'start':
        return this.start(args.url);
      case 'navigate': {
        const url = normalizeAddress(args.url);
        if (!url) throw new Error('Enter an address');
        if (!this.conn) return this.start(url);
        if (!this.activeId) return this.newTab(url);
        const session = await this.withSession();
        await this.conn.send('Page.navigate', { url }, session.id);
        return { url };
      }
      case 'back':
      case 'forward': {
        const session = await this.withSession();
        const history = await this.conn.send('Page.getNavigationHistory', {}, session.id);
        const entry = history.entries[history.currentIndex + (op === 'back' ? -1 : 1)];
        if (entry) await this.conn.send('Page.navigateToHistoryEntry', { entryId: entry.id }, session.id);
        return {};
      }
      case 'reload': {
        const session = await this.withSession();
        await this.conn.send('Page.reload', { ignoreCache: args.ignoreCache === true }, session.id);
        return {};
      }
      case 'stop': {
        const session = await this.withSession();
        await this.conn.send('Page.stopLoading', {}, session.id);
        return {};
      }
      case 'newTab':
        return this.newTab(normalizeAddress(args.url) ?? 'about:blank');
      case 'closeTab': {
        if (!this.conn) return {};
        const targetId = typeof args.targetId === 'string' ? args.targetId : this.activeId;
        if (targetId) await this.conn.send('Target.closeTarget', { targetId });
        return {};
      }
      case 'activate':
        if (typeof args.targetId === 'string') this.activate(args.targetId, 'user');
        return {};
      case 'resize': {
        const width = Math.round(num(args.width));
        const height = Math.round(num(args.height));
        if (width < 120 || height < 120) return {};
        const next = { width: Math.min(width, 3840), height: Math.min(height, 2160) };
        if (this.viewport?.width === next.width && this.viewport?.height === next.height) return {};
        this.viewport = next;
        await this.sessionTask;
        await this.applyViewport().catch(() => {});
        return {};
      }
      case 'setFill':
        this.fill = args.fill !== false;
        this.publish();
        await this.sessionTask;
        await this.applyViewport().catch(() => {});
        return {};
      case 'zoom': {
        const current = ZOOM_STEPS.indexOf(this.zoom);
        let next = 1;
        if (args.reset !== true) {
          const index = current === -1 ? ZOOM_STEPS.indexOf(1) : current;
          next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + (num(args.delta) > 0 ? 1 : -1)))];
        }
        this.zoom = next;
        this.publish();
        await this.sessionTask;
        await this.applyViewport().catch(() => {});
        return { zoom: next };
      }
      case 'capture':
        return this.capture();
      case 'inspect':
        return this.inspectAt(num(args.x), num(args.y));
      case 'pick':
        return this.pickAt(num(args.x), num(args.y));
      case 'pickEnd':
        return this.endPick();
      case 'find':
        return this.find(String(args.query ?? ''), args.backwards === true, args.reset === true);
      case 'findEnd':
        return this.endFind();
      case 'servers':
        await this.refreshServers(true);
        return { servers: this.servers };
      case 'dialog': {
        const session = await this.withSession();
        await this.conn.send('Page.handleJavaScriptDialog', {
          accept: args.accept === true,
          ...(typeof args.promptText === 'string' ? { promptText: args.promptText } : {}),
        }, session.id);
        this.dialog = null;
        this.publish();
        return {};
      }
      default:
        throw new Error(`Unknown command ${op}`);
    }
  }

  /* ------------------------------------------------- dev servers, capture, pick */

  setExcludedPorts(ports) {
    this.excludePorts = new Set(ports.filter((port) => Number.isInteger(port) && port > 0));
  }

  refreshServers(force = false) {
    if (this.serversTask && !force) return this.serversTask;
    this.serversAt = Date.now();
    const exclude = new Set(this.excludePorts);
    for (const port of this.excludePortsProvider?.() ?? []) if (Number.isInteger(port)) exclude.add(port);
    if (this.conn?.socket?.url) {
      const port = Number(new URL(this.conn.socket.url).port);
      if (port) exclude.add(port);
    }
    this.serversTask = discoverServers(exclude).then((servers) => {
      const before = new Set(this.servers.map((server) => server.port));
      const changed = servers.length !== this.servers.length || servers.some((server) => !before.has(server.port));
      const appeared = servers.filter((server) => !before.has(server.port));
      this.servers = servers;
      if (changed) this.publish();
      // The first scan reports what was already running; later ones announce new servers.
      if (this.serversSeeded) for (const server of appeared) if (server.html) this.emit({ t: 'server', server });
      this.serversSeeded = true;
    }).catch(() => {}).finally(() => {
      this.serversTask = null;
    });
    return this.serversTask;
  }

  async saveCapture(base64, label) {
    await mkdir(CAPTURES_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const slug = String(label || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page';
    const path = join(CAPTURES_DIR, `${stamp}-${slug}.png`);
    await writeFile(path, Buffer.from(base64, 'base64'));
    return path;
  }

  /** The viewed tab's visible area as a PNG file, for the chat. */
  async capture() {
    const session = await this.withSession();
    const shot = await this.conn.send('Page.captureScreenshot', { format: 'png' }, session.id);
    const tab = this.tabs.get(this.activeId);
    const path = await this.saveCapture(shot.data, tab ? new URL(tab.url).hostname : 'page');
    return { path, url: tab?.url ?? '', title: tab?.title ?? '' };
  }

  async ensureInspector(sessionId) {
    if (this.session?.inspector) return;
    await this.conn.send('DOM.enable', {}, sessionId);
    await this.conn.send('Overlay.enable', {}, sessionId);
    if (this.session) this.session.inspector = true;
  }

  async nodeAt(sessionId, x, y) {
    const { backendNodeId } = await this.conn.send('DOM.getNodeForLocation', {
      x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false, ignorePointerEventsNone: true,
    }, sessionId);
    return backendNodeId;
  }

  /** Highlight the element under the pointer while picking (drawn in the page, so it streams). */
  async inspectAt(x, y) {
    const session = await this.withSession();
    await this.ensureInspector(session.id);
    this.picking = true;
    try {
      const backendNodeId = await this.nodeAt(session.id, x, y);
      await this.conn.send('Overlay.highlightNode', { highlightConfig: HIGHLIGHT, backendNodeId }, session.id);
    } catch {
      await this.conn.send('Overlay.hideHighlight', {}, session.id).catch(() => {});
    }
    return {};
  }

  /** Describe the element at a point and capture it, for "annotate": it goes into the chat. */
  async pickAt(x, y) {
    const session = await this.withSession();
    await this.ensureInspector(session.id);
    const backendNodeId = await this.nodeAt(session.id, x, y);
    const { object } = await this.conn.send('DOM.resolveNode', { backendNodeId }, session.id);
    const described = await this.conn.send('Runtime.callFunctionOn', {
      objectId: object.objectId, functionDeclaration: DESCRIBE_ELEMENT, returnByValue: true,
    }, session.id);
    const element = described.result?.value ?? {};
    await this.conn.send('Overlay.hideHighlight', {}, session.id).catch(() => {});
    let path = '';
    const rect = element.rect;
    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 8;
      const metrics = await this.conn.send('Page.getLayoutMetrics', {}, session.id);
      const viewport = metrics.cssVisualViewport ?? {};
      const left = Math.max(0, rect.x - pad);
      const top = Math.max(0, rect.y - pad);
      const clip = {
        x: left + num(viewport.pageX),
        y: top + num(viewport.pageY),
        width: Math.min(rect.width + pad * 2, num(viewport.clientWidth, 4000) - left),
        height: Math.min(rect.height + pad * 2, num(viewport.clientHeight, 4000) - top),
        scale: 1,
      };
      if (clip.width > 0 && clip.height > 0) {
        const shot = await this.conn.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false }, session.id);
        path = await this.saveCapture(shot.data, `${element.tag || 'element'}-${element.id || element.text || ''}`);
      }
    }
    this.picking = false;
    const tab = this.tabs.get(this.activeId);
    return { element, path, url: tab?.url ?? '', title: tab?.title ?? '' };
  }

  async endPick() {
    this.picking = false;
    if (this.session && this.conn) await this.conn.send('Overlay.hideHighlight', {}, this.session.id).catch(() => {});
    return {};
  }

  /** Find in page: selects and scrolls to the next match; reports how many there are. */
  async find(query, backwards, reset) {
    const session = await this.withSession();
    if (!query) return this.endFind();
    const expression = `(() => {
      const q = ${JSON.stringify(query)};
      if (${reset ? 'true' : 'false'}) { const s = getSelection(); s && s.removeAllRanges(); }
      const found = window.find(q, false, ${backwards ? 'true' : 'false'}, true, false, false, false);
      const text = (document.body && document.body.innerText) || '';
      const lower = text.toLowerCase(), needle = q.toLowerCase();
      let count = 0;
      for (let i = lower.indexOf(needle); i !== -1 && count < 9999; i = lower.indexOf(needle, i + needle.length)) count++;
      return { found, count };
    })()`;
    const { result } = await this.conn.send('Runtime.evaluate', { expression, returnByValue: true }, session.id);
    return result?.value ?? { found: false, count: 0 };
  }

  async endFind() {
    if (this.session && this.conn) {
      await this.conn.send('Runtime.evaluate', { expression: 'getSelection() && getSelection().removeAllRanges()' }, this.session.id).catch(() => {});
    }
    return {};
  }

  async newTab(url) {
    if (!this.conn) return this.start(url);
    this.markUserIntent();
    // Its own window keeps the tab rendering even when the agent fronts another tab elsewhere.
    const { targetId } = await this.conn.send('Target.createTarget', { url: url || 'about:blank', newWindow: true });
    // targetCreated may land before or after this reply; either way the user's new tab is viewed.
    await sleep(50);
    this.activate(targetId, 'user');
    return { targetId };
  }

  /** Launch the ego Chrome through the dsh-browser-cdp runtime, opening `url` in a sidebar task space. */
  async start(url) {
    if (this.status.launching) return {};
    const cli = await findEgoCli(this.preferredProfile);
    if (!cli) throw new Error('dsh-browser-cdp is not installed in this DSH profile');
    this.setStatus({ launching: true, error: null });
    this.markUserIntent();
    const target = normalizeAddress(url) ?? 'about:blank';
    const script = [
      'const task = await taskSpaces.useOrCreate("sidebar");',
      `await page.goto(${JSON.stringify(target)}, { wait: false });`,
      'console.log("ok");',
    ].join('\n');
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli], {
          stdio: ['pipe', 'ignore', 'pipe'],
          // Headless: the browser is shown only inside DSH, never as a second Chrome window.
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', EGO_LINUX_HEADLESS: '1' },
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr = (stderr + chunk).slice(-2000);
        });
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('The browser took too long to start'));
        }, 45_000);
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(stderr.trim().split('\n').pop() || `The browser launcher exited with ${code}`));
        });
        child.stdin.end(script);
      });
      this.markUserIntent();
      await this.connect();
      return {};
    } catch (error) {
      this.setStatus({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.setStatus({ launching: false });
    }
  }
}
