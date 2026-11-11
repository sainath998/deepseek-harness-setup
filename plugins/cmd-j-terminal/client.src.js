window.__ModuleLoader__.load({
  id: '@local/cmd-j-terminal',
  factory(require) {
    // Cmd+J toggles a T3-style terminal panel in the frame's official `shell.bottom` seat.
    // Terminals are real dsh user terminals from `ctx.webTerminals` (the same service the right-sidebar
    // terminal uses), so they run in the chat's working directory and survive reloads.
    const React = require('react');
    const h = React.createElement;
    const P = require('@deepseek-ai/dsh-client-ui-primitives');

    // Vendored @xterm/xterm 6.0.0 and @xterm/addon-fit 0.11.0 (MIT), the versions dsh ships.
    const XTerm = (function () {
      const module = { exports: {} };
      const exports = module.exports;
      /*__XTERM__*/
      return module.exports;
    })();
    const Fit = (function () {
      const module = { exports: {} };
      const exports = module.exports;
      /*__FIT__*/
      return module.exports;
    })();
    const XTERM_CSS = /*__XTERM_CSS__*/;

    const ID = '@local/cmd-j-terminal';
    const STORAGE = 'local.cmd-j-terminal.v1';
    const MIN_HEIGHT = 120;
    const DEFAULT_HEIGHT = 280;
    const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    const CSS = `
.lcj-root{position:relative;display:flex;flex-direction:column;min-height:0;border-top:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px}
.lcj-resize{position:absolute;top:-4px;left:0;right:0;height:8px;cursor:row-resize;z-index:3;touch-action:none}
.lcj-bar{display:flex;align-items:center;gap:4px;height:32px;padding:0 6px 0 10px;flex:none}
.lcj-tabs{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none}
.lcj-tab{display:flex;align-items:center;gap:6px;height:24px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.lcj-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lcj-tab[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lcj-tab svg{flex:none}
.lcj-x{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;color:var(--dsw-alias-label-tertiary)}
.lcj-x:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.lcj-x svg{width:12px;height:12px}
.lcj-spacer{flex:1}
.lcj-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;margin-right:4px;white-space:nowrap}
.lcj-body{position:relative;flex:1;min-height:0}
.lcj-screen{position:absolute;inset:2px 6px 6px 12px}
.lcj-screen .xterm{height:100%}
.lcj-status{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;pointer-events:none}
.lcj-status>*{pointer-events:auto}
.lcj-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
`;

    function readJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }
    function writeJSON(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
    }
    function clampHeight(value) {
      const max = Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.8));
      return Math.min(max, Math.max(MIN_HEIGHT, Number.isFinite(value) ? value : DEFAULT_HEIGHT));
    }
    function uuid() {
      return globalThis.crypto.randomUUID();
    }

    /** Per-Session panel state ({ open, tabs, active }) plus the shared height, persisted per device. */
    function createStore() {
      const saved = readJSON(`${STORAGE}.sessions`, {});
      let state = {
        sessions: saved !== null && typeof saved === 'object' ? saved : {},
        height: clampHeight(readJSON(`${STORAGE}.height`, DEFAULT_HEIGHT)),
        focus: 0,
      };
      const listeners = new Set();
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(next) {
          state = next;
          writeJSON(`${STORAGE}.sessions`, state.sessions);
          writeJSON(`${STORAGE}.height`, state.height);
          for (const listener of [...listeners]) listener();
        },
      };
    }

    function useObservable(observable) {
      return React.useSyncExternalStore(observable.subscribe, observable.getSnapshot);
    }

    function TerminalGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 4L7 8L3 12', stroke: 'currentColor' }),
        h('path', { d: 'M9 12H13', stroke: 'currentColor' }));
    }

    return {
      inject: ['slots', 'shortcuts', 'sidebarRight', 'webTerminals', 'theme'],
      apply(ctx) {
        const store = createStore();
        const theme = {
          getSnapshot: () => ctx.theme.getTheme(),
          subscribe: (listener) => ctx.on('theme/change', listener),
        };

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = ID;
          style.textContent = XTERM_CSS + CSS;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        }, 'cmd-j-terminal: styles');

        const entryOf = (sessionId) => store.getSnapshot().sessions[sessionId] ?? { open: false, tabs: [], active: undefined };
        const update = (sessionId, patch, extra = {}) => {
          const state = store.getSnapshot();
          store.set({ ...state, ...extra, sessions: { ...state.sessions, [sessionId]: { ...entryOf(sessionId), ...patch } } });
        };
        const viewOf = (sessionId, tab) => ctx.webTerminals.view(sessionId, tab.key, tab.contentId);
        const newTab = () => {
          const id = uuid();
          return { key: `local-bottom:${id}`, contentId: `dsh-local-bottom-terminal://${id}` };
        };

        const addTerminal = (sessionId) => {
          const entry = entryOf(sessionId);
          const tab = newTab();
          update(sessionId, { open: true, tabs: [...entry.tabs, tab], active: tab.key }, { focus: store.getSnapshot().focus + 1 });
        };
        const closeTerminal = (sessionId, key) => {
          const entry = entryOf(sessionId);
          const tab = entry.tabs.find((item) => item.key === key);
          if (tab === undefined) return;
          ctx.webTerminals.close(sessionId, tab.key, tab.contentId);
          const tabs = entry.tabs.filter((item) => item.key !== key);
          const index = entry.tabs.indexOf(tab);
          const active = entry.active === key ? tabs[Math.min(index, tabs.length - 1)]?.key : entry.active;
          update(sessionId, { tabs, active, open: tabs.length > 0 && entry.open });
        };
        const replaceTerminal = (sessionId, key) => {
          const entry = entryOf(sessionId);
          const tab = entry.tabs.find((item) => item.key === key);
          if (tab === undefined) return;
          ctx.webTerminals.close(sessionId, tab.key, tab.contentId);
          const fresh = newTab();
          update(sessionId, { tabs: entry.tabs.map((item) => (item.key === key ? fresh : item)), active: fresh.key }, { focus: store.getSnapshot().focus + 1 });
        };
        const hide = (sessionId) => {
          const root = document.querySelector('[data-local-cmd-j-terminal]');
          if (root !== null && root.contains(document.activeElement)) document.activeElement.blur();
          update(sessionId, { open: false });
        };
        const toggle = (sessionId) => {
          const entry = entryOf(sessionId);
          if (entry.open && entry.tabs.length > 0) {
            hide(sessionId);
            return;
          }
          if (entry.tabs.length === 0) {
            addTerminal(sessionId);
            return;
          }
          const active = entry.tabs.some((tab) => tab.key === entry.active) ? entry.active : entry.tabs[entry.tabs.length - 1].key;
          update(sessionId, { open: true, active }, { focus: store.getSnapshot().focus + 1 });
        };

        ctx.effect(() => ctx.shortcuts.register({
          id: 'local.terminal.toggle',
          label: () => 'Toggle bottom terminal',
          aliases: ['toggle terminal', 'terminal panel', 'bottom terminal'],
          defaults: {
            'desktop:macos': { code: 'KeyJ', modifiers: ['primary'] },
            'desktop:windows': { code: 'KeyJ', modifiers: ['primary'] },
            'desktop:linux': { code: 'KeyJ', modifiers: ['primary'] },
          },
          regions: ['page', 'editable', 'terminal'],
          modals: [],
          resolve: () => {
            const sessionId = ctx.sidebarRight.mounted.getSnapshot();
            if (sessionId === undefined) return { status: 'blocked', reason: 'No chat on screen' };
            return { status: 'handled', run: () => toggle(sessionId) };
          },
        }), 'cmd-j-terminal: shortcut');

        function Screen({ sessionId, tab, focusNonce }) {
          const view = viewOf(sessionId, tab);
          const state = useObservable(view.state);
          const appearance = useObservable(theme);
          const fontSize = appearance?.fontSizes?.terminal ?? 12;
          const families = appearance?.fontFamilies?.terminal ?? '';
          const fontFamily = families === '' ? FONT_STACK : `${families}, ${FONT_STACK}`;
          const element = React.useRef(null);
          const terminal = React.useRef(undefined);
          const fit = React.useRef(undefined);
          const lastRevision = React.useRef(0);
          const live = React.useRef(state);
          live.current = state;

          const measure = React.useCallback(() => {
            const xterm = terminal.current;
            const node = element.current;
            const current = live.current;
            if (xterm === undefined || node === null || node.clientWidth === 0 || node.clientHeight === 0) return;
            if (!current.writable || current.environment === undefined) return;
            const dimensions = fit.current.proposeDimensions();
            if (dimensions === undefined) return;
            const cols = Math.min(dimensions.cols, current.environment.maxCols);
            const rows = Math.min(dimensions.rows, current.environment.maxRows);
            if (cols < 2 || rows < 1) return;
            xterm.resize(cols, rows);
            view.resize(cols, rows);
          }, [view]);

          const paint = React.useCallback(() => {
            const xterm = terminal.current;
            const node = element.current;
            if (xterm === undefined || node === null) return;
            const style = getComputedStyle(node.closest('.lcj-root') ?? node);
            xterm.options.theme = {
              background: style.backgroundColor,
              foreground: style.color,
              cursor: style.color,
              cursorAccent: style.backgroundColor,
              selectionBackground: 'rgba(128, 128, 128, 0.35)',
            };
          }, []);

          React.useLayoutEffect(() => {
            const node = element.current;
            const xterm = new XTerm.Terminal({
              minimumContrastRatio: 4.5,
              cursorBlink: true,
              fontSize,
              fontFamily,
              scrollback: live.current.environment?.scrollback ?? 1000,
            });
            const addon = new Fit.FitAddon();
            xterm.loadAddon(addon);
            xterm.open(node);
            xterm.textarea?.setAttribute('aria-label', 'Terminal');
            terminal.current = xterm;
            fit.current = addon;
            lastRevision.current = 0;
            paint();
            const input = xterm.onData((data) => {
              view.write(data);
            });
            const observer = new ResizeObserver(() => measure());
            observer.observe(node);
            return () => {
              observer.disconnect();
              input.dispose();
              xterm.dispose();
              terminal.current = undefined;
              fit.current = undefined;
            };
          }, [view]);

          React.useEffect(() => view.mount(), [view]);

          React.useLayoutEffect(() => {
            paint();
          }, [appearance, paint]);

          React.useLayoutEffect(() => {
            const xterm = terminal.current;
            if (xterm === undefined) return;
            if (xterm.options.fontFamily === fontFamily && xterm.options.fontSize === fontSize) return;
            xterm.options.fontFamily = fontFamily;
            xterm.options.fontSize = fontSize;
            measure();
          }, [fontFamily, fontSize, measure]);

          React.useLayoutEffect(() => {
            const xterm = terminal.current;
            const render = state.render;
            if (xterm === undefined || render === undefined || render.revision <= lastRevision.current) return;
            lastRevision.current = render.revision;
            const snapshot = render.frame.type === 'snapshot';
            if (snapshot) {
              xterm.reset();
              xterm.resize(render.frame.info.cols, render.frame.info.rows);
            }
            xterm.write(snapshot ? render.frame.screen : render.frame.data, () => {
              view.acknowledge(render.revision);
              if (snapshot) measure();
            });
          }, [state.render, view, measure]);

          React.useLayoutEffect(() => {
            const xterm = terminal.current;
            if (xterm === undefined) return;
            xterm.options.disableStdin = !state.writable;
            if (state.writable) measure();
            else if (state.info !== undefined) xterm.resize(state.info.cols, state.info.rows);
          }, [state.writable, state.info?.cols, state.info?.rows, measure]);

          React.useEffect(() => {
            if (state.writable) terminal.current?.focus();
          }, [state.writable, focusNonce]);

          return h('div', { className: 'lcj-body' },
            h('div', { className: 'lcj-screen', ref: element }),
            h(Status, { sessionId, tab, state, view }));
        }

        function Status({ sessionId, tab, state, view }) {
          const exited = state.info?.state === 'exited';
          const button = (label, onClick, variant = 'outline') => h(P.Button, { size: 'sm', variant, onClick }, label);
          if (state.issue === 'missingTerminal') {
            return h('div', { className: 'lcj-status' }, h('span', null, 'This terminal no longer exists.'),
              button('New terminal', () => replaceTerminal(sessionId, tab.key), 'primary'));
          }
          if (state.phase === 'failed') {
            return h('div', { className: 'lcj-status', 'data-tone': 'error' },
              h('span', null, state.issue === 'terminalLimit' ? 'Terminal limit reached; close an unused terminal.' : `Terminal error: ${state.error ?? 'unknown'}`),
              button('Retry', () => (state.info === undefined ? view.refresh() : view.connect())));
          }
          if (state.phase === 'disconnected') {
            return h('div', { className: 'lcj-status' }, h('span', null, 'Disconnected.'), button('Reconnect', () => view.connect()));
          }
          if (state.phase === 'closed' || exited) {
            return h('div', { className: 'lcj-status' }, h('span', null, 'Process exited.'),
              button('New terminal', () => replaceTerminal(sessionId, tab.key), 'primary'));
          }
          if (state.phase === 'connected' && !state.writable) {
            return h('div', { className: 'lcj-status' }, h('span', null, 'Another window controls this terminal.'),
              button('Take control', () => view.connect()));
          }
          if (state.render === undefined && (state.phase === 'loading' || state.phase === 'creating' || state.phase === 'connecting' || state.phase === 'idle')) {
            return h('div', { className: 'lcj-status' }, h('span', null, state.phase === 'connecting' ? 'Connecting…' : 'Starting…'));
          }
          return null;
        }

        function TabChip({ sessionId, tab, active, index }) {
          const view = viewOf(sessionId, tab);
          const title = useObservable(view.state).title;
          return h('button', {
            type: 'button',
            role: 'tab',
            className: 'lcj-tab',
            'aria-selected': active,
            onClick: () => update(sessionId, { active: tab.key }, { focus: store.getSnapshot().focus + 1 }),
            onAuxClick: (event) => {
              if (event.button === 1) closeTerminal(sessionId, tab.key);
            },
          },
          h(TerminalGlyph),
          h('span', null, title || `Terminal ${index + 1}`),
          h('span', {
            className: 'lcj-x',
            role: 'button',
            'aria-label': 'Close terminal',
            onClick: (event) => {
              event.stopPropagation();
              closeTerminal(sessionId, tab.key);
            },
          }, h(P.IconCloseOutlineRegular)));
        }

        function ResizeHandle({ height }) {
          const onPointerDown = (event) => {
            event.preventDefault();
            const startY = event.clientY;
            const startHeight = height;
            const target = event.currentTarget;
            target.setPointerCapture(event.pointerId);
            const move = (next) => {
              const state = store.getSnapshot();
              store.set({ ...state, height: clampHeight(startHeight - (next.clientY - startY)) });
            };
            const up = () => {
              target.removeEventListener('pointermove', move);
              target.removeEventListener('pointerup', up);
              target.removeEventListener('pointercancel', up);
            };
            target.addEventListener('pointermove', move);
            target.addEventListener('pointerup', up);
            target.addEventListener('pointercancel', up);
          };
          return h('div', { className: 'lcj-resize', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Resize terminal', onPointerDown });
        }

        function IconButton({ label, onClick, icon }) {
          return h(P.Tooltip, { label, side: 'top' },
            h(P.Button, { size: 'sm', 'aria-label': label, onClick }, h(icon)));
        }

        function BottomPanel() {
          const sessionId = useObservable(ctx.sidebarRight.mounted);
          const state = useObservable(store);
          const entry = sessionId === undefined ? undefined : state.sessions[sessionId];
          if (sessionId === undefined || entry === undefined || !entry.open || entry.tabs.length === 0) return null;
          const active = entry.tabs.find((tab) => tab.key === entry.active) ?? entry.tabs[entry.tabs.length - 1];
          return h('div', { className: 'lcj-root', style: { height: state.height }, 'data-local-cmd-j-terminal': '' },
            h(ResizeHandle, { height: state.height }),
            h('div', { className: 'lcj-bar' },
              h('div', { className: 'lcj-tabs', role: 'tablist', 'aria-label': 'Terminals' },
                entry.tabs.map((tab, index) => h(TabChip, { key: tab.key, sessionId, tab, index, active: tab.key === active.key }))),
              h(IconButton, { label: 'New terminal', icon: P.IconPlusOutlineRegular, onClick: () => addTerminal(sessionId) }),
              h('div', { className: 'lcj-spacer' }),
              h('span', { className: 'lcj-hint' }, '⌘J'),
              h(IconButton, { label: 'Hide terminal (⌘J)', icon: P.IconChevronDownOutlineRegular, onClick: () => hide(sessionId) })),
            h(Screen, { key: active.key, sessionId, tab: active, focusNonce: state.focus }));
        }

        ctx.slots.inject('shell.bottom', () => ctx.slots.register({ name: 'shell.bottom', inject: () => ({}) }, BottomPanel));
      },
    };
  },
});
