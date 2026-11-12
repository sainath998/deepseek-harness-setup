window.__ModuleLoader__.load({
  id: '@local/agent-browser',
  factory(require) {
    // The agent browser, T3 Code style: the Chrome the agent drives (dsh-browser-cdp's ego runtime)
    // lives in a right-sidebar tab you can use directly — address bar, tabs, mouse, keyboard — and
    // when you collapse the sidebar it keeps playing in a floating mini player over the chat, with
    // actions to put it back in the sidebar or to dismiss the preview (the browser keeps running).
    // Frames and input travel over this plugin's Host routes (index.js / hub.js).
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useLayoutEffect, useRef, useState, useCallback } = React;
    const P = require('@deepseek-ai/dsh-client-ui-primitives');

    const ID = '@local/agent-browser';
    const KIND = 'local-agent-browser';
    const API = 'api/local-agent-browser/';
    const FLOAT_KEY = 'local.agent-browser.float.v1';

    const EDGE_GAP = 12;
    const FLOAT_DEFAULT_WIDTH = 400;
    const FLOAT_MIN_WIDTH = 240;
    const FLOAT_MIN_HEIGHT = 150;
    const TAP_SLOP_PX = 6;
    const DOUBLE_CLICK_MS = 450;
    // After the user dismisses the floating preview, agent activity shows it again only once the
    // agent has been idle this long (a new browsing burst), so it does not pop straight back.
    const AGENT_BURST_GAP_MS = 45_000;
    const INPUT_SENTINEL = '​';

    const CSS = `
.lab{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;background:var(--dsw-alias-bg-base)}
.lab-tabs{display:flex;align-items:center;gap:2px;padding:6px 8px 0;flex:none;overflow-x:auto;scrollbar-width:none}
.lab-tabs::-webkit-scrollbar{display:none}
.lab-tab{display:flex;align-items:center;gap:6px;min-width:0;max-width:180px;height:26px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;flex:0 1 auto}
.lab-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lab-tab[aria-selected=true]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}
.lab-tab-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.lab-tab-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;flex:none;opacity:0;color:inherit}
.lab-tab:hover .lab-tab-x,.lab-tab[aria-selected=true] .lab-tab-x{opacity:.7}
.lab-tab-x:hover{opacity:1!important;background:var(--dsw-alias-interactive-bg-hover)}
.lab-chrome{display:flex;align-items:center;gap:2px;padding:6px 8px;flex:none;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.lab-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:none;border-radius:var(--dsw-radius-sm,6px);background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.lab-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lab-btn:disabled{opacity:.35;cursor:default}
.lab-btn[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.lab-url{flex:1;min-width:60px;display:flex;align-items:center;gap:6px;height:28px;margin:0 4px;padding:0 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));border:.5px solid transparent}
.lab-url:focus-within{border-color:var(--dsw-alias-border-l4,var(--dsw-alias-label-tertiary));background:var(--dsw-alias-bg-base)}
.lab-url input{flex:1;min-width:0;border:none;outline:none;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;padding:0}
.lab-url input::placeholder{color:var(--dsw-alias-label-tertiary)}
.lab-url-icon{display:inline-flex;color:var(--dsw-alias-label-tertiary);flex:none}
.lab-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.lab-surface{position:absolute;inset:0;outline:none}
.lab-surface canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;touch-action:none;user-select:none;-webkit-user-select:none}
.lab-surface-ring{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 1.5px transparent;transition:box-shadow .12s;z-index:3}
.lab-surface[data-focused=true] .lab-surface-ring{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 55%,transparent)}
.lab-input{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0;resize:none;font-size:16px;pointer-events:none}
.lab-progress{position:absolute;left:0;top:0;height:2px;width:100%;z-index:4;overflow:hidden;pointer-events:none}
.lab-progress::after{content:"";position:absolute;inset:0;width:35%;background:var(--dsw-alias-brand-primary,#4d6bfe);animation:lab-load 1.1s ease-in-out infinite}
@keyframes lab-load{0%{transform:translateX(-100%)}100%{transform:translateX(290%)}}
.lab-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;z-index:2;pointer-events:none}
.lab-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px}
.lab-card{width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.lab-card-icon{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-secondary)}
.lab-card h3{margin:2px 0 0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.lab-card p{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}
.lab-card form{display:flex;gap:6px;width:100%;margin-top:6px}
.lab-card input{flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
.lab-card input:focus{border-color:var(--dsw-alias-border-l4,var(--dsw-alias-label-tertiary))}
.lab-primary{height:32px;padding:0 14px;border:none;border-radius:8px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));color:var(--dsw-alias-label-primary-foreground,#fff);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap}
.lab-primary:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-button-primary-fill))}
.lab-primary:disabled{opacity:.5;cursor:default}
.lab-error{color:var(--dsw-alias-state-error-primary);font-size:12px}
.lab-dialog{position:absolute;left:8px;right:8px;top:8px;z-index:5;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 8px 28px rgba(0,0,0,.25);font-size:12.5px}
.lab-dialog-row{display:flex;gap:6px;justify-content:flex-end}
.lab-ghost{height:28px;padding:0 12px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.lab-ghost:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lab-menu{position:fixed;z-index:60;min-width:200px;padding:4px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgba(0,0,0,.28)}
.lab-menu button{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border:none;border-radius:6px;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.lab-menu button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lab-menu-check{width:14px;display:inline-flex;justify-content:center;color:var(--dsw-alias-label-secondary)}
.lab-menu hr{border:none;border-top:.5px solid var(--dsw-alias-border-l2);margin:4px 2px}
.lab-float-layer{position:fixed;inset:0;pointer-events:none;z-index:45}
.lab-float{position:absolute;pointer-events:auto;border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 50px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.18);user-select:none}
.lab-float-clip{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
.lab-float-ring{position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,rgba(127,127,127,.35));z-index:6}
.lab-handle{position:absolute;right:10px;top:10px;z-index:7;touch-action:none}
.lab-handle-dot{position:absolute;right:0;top:0;width:8px;height:8px;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-label-primary) 28%,transparent);box-shadow:0 0 0 1.5px color-mix(in srgb,var(--dsw-alias-bg-base) 70%,transparent);transition:opacity .15s}
.lab-handle-dot[data-agent=true]{background:var(--dsw-alias-brand-primary,#4d6bfe);animation:lab-pulse 1.4s ease-in-out infinite}
@keyframes lab-pulse{50%{opacity:.45}}
.lab-pill{position:absolute;right:-4px;top:-4px;display:flex;align-items:center;gap:1px;height:32px;padding:2px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base)) 92%,transparent);border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 6px 18px rgba(0,0,0,.22);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);opacity:0;pointer-events:none;transition:opacity .15s;cursor:grab;white-space:nowrap}
.lab-float:hover .lab-pill,.lab-float[data-pill=true] .lab-pill,.lab-pill:focus-within{opacity:1;pointer-events:auto}
.lab-float:hover .lab-handle-dot,.lab-float[data-pill=true] .lab-handle-dot{opacity:0}
.lab-float[data-dragging=true] .lab-pill{cursor:grabbing}
.lab-pill .lab-btn{width:26px;height:26px}
.lab-pill-grip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:26px;color:var(--dsw-alias-label-tertiary)}
.lab-resize{position:absolute;z-index:7;touch-action:none}
.lab-find{position:absolute;top:8px;right:8px;z-index:6;display:flex;align-items:center;gap:2px;padding:3px 3px 3px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.25)}
.lab-find input{width:170px;border:none;outline:none;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.lab-find-count{font-size:11.5px;color:var(--dsw-alias-label-tertiary);min-width:44px;text-align:right;padding-right:4px;font-variant-numeric:tabular-nums}
.lab-banner{position:absolute;left:8px;right:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:12.5px}
.lab-banner-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lab-banner-text b{font-weight:600}
.lab-note{position:absolute;left:8px;right:8px;bottom:8px;z-index:6;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:12.5px}
.lab-note-head{display:flex;gap:10px;align-items:flex-start}
.lab-note-thumb{width:64px;height:44px;border-radius:6px;object-fit:cover;flex:none;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2)}
.lab-note-tag{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--dsw-alias-label-primary);word-break:break-all}
.lab-note-text{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.lab-note textarea{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;padding:8px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
.lab-note textarea:focus{border-color:var(--dsw-alias-border-l4,var(--dsw-alias-label-tertiary))}
.lab-pickhint{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:6;padding:5px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 6px 18px rgba(0,0,0,.22);font-size:12px;color:var(--dsw-alias-label-secondary);pointer-events:none;white-space:nowrap}
.lab-zoom{height:22px;padding:0 7px;border:none;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;flex:none;font-variant-numeric:tabular-nums}
.lab-servers{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:8px}
.lab-server{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.lab-server:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lab-server-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#22c55e);flex:none}
.lab-server-main{flex:1;min-width:0;display:flex;flex-direction:column}
.lab-server-main span:last-child{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.lab-server-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lab-tooltip{position:fixed;z-index:70;padding:4px 8px;border-radius:6px;background:var(--dsw-alias-tooltip-bg,#222);color:#fff;font-size:11.5px;pointer-events:none;white-space:nowrap}
`;

    /* ------------------------------------------------------------------ icons */

    const svg = (children, size = 16) => h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    }, ...children);
    const path = (d) => h('path', { d, key: d });
    const Icon = {
      back: (s) => svg([path('m12 19-7-7 7-7'), path('M19 12H5')], s),
      forward: (s) => svg([path('M5 12h14'), path('m12 5 7 7-7 7')], s),
      reload: (s) => svg([path('M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'), path('M21 3v5h-5')], s),
      x: (s) => svg([path('M18 6 6 18'), path('m6 6 12 12')], s),
      external: (s) => svg([path('M15 3h6v6'), path('M10 14 21 3'), path('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')], s),
      more: (s) => svg([h('circle', { key: 1, cx: 5, cy: 12, r: 1 }), h('circle', { key: 2, cx: 12, cy: 12, r: 1 }), h('circle', { key: 3, cx: 19, cy: 12, r: 1 })], s),
      plus: (s) => svg([path('M5 12h14'), path('M12 5v14')], s),
      globe: (s) => svg([h('circle', { key: 'c', cx: 12, cy: 12, r: 10 }), path('M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20'), path('M2 12h20')], s),
      popout: (s) => svg([path('M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4'), h('rect', { key: 'r', x: 12, y: 13, width: 10, height: 7, rx: 2 })], s),
      panelRight: (s) => svg([h('rect', { key: 'r', x: 3, y: 3, width: 18, height: 18, rx: 2 }), path('M15 3v18')], s),
      lock: (s) => svg([h('rect', { key: 'r', x: 4, y: 11, width: 16, height: 10, rx: 2 }), path('M8 11V7a4 4 0 0 1 8 0v4')], s),
      search: (s) => svg([h('circle', { key: 'c', cx: 11, cy: 11, r: 7 }), path('m20 20-3.5-3.5')], s),
      check: (s) => svg([path('M20 6 9 17l-5-5')], s),
      camera: (s) => svg([path('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'), h('circle', { key: 'c', cx: 12, cy: 13, r: 3 })], s),
      pick: (s) => svg([path('M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'), path('m13 13 6 6')], s),
      server: (s) => svg([h('rect', { key: 'a', x: 2, y: 3, width: 20, height: 8, rx: 2 }), h('rect', { key: 'b', x: 2, y: 13, width: 20, height: 8, rx: 2 }), path('M6 7h.01'), path('M6 17h.01')], s),
      up: (s) => svg([path('m18 15-6-6-6 6')], s),
      down: (s) => svg([path('m6 9 6 6 6-6')], s),
      grip: (s) => svg([1, 2, 3].flatMap((row) => [9, 15].map((x) => h('circle', { key: `${row}${x}`, cx: x, cy: row * 6, r: 1, fill: 'currentColor', stroke: 'none' }))), s),
    };

    /* ------------------------------------------------------------------ store */

    const readFloatGeometry = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(FLOAT_KEY) ?? 'null');
        if (raw && typeof raw === 'object') {
          return {
            x: Number.isFinite(raw.x) ? raw.x : null,
            y: Number.isFinite(raw.y) ? raw.y : null,
            width: Number.isFinite(raw.width) ? raw.width : null,
          };
        }
      } catch {}
      return { x: null, y: null, width: null };
    };
    const writeFloatGeometry = (geometry) => {
      try {
        localStorage.setItem(FLOAT_KEY, JSON.stringify(geometry));
      } catch {}
    };

    const EMPTY_NAV = { url: '', title: '', canGoBack: false, canGoForward: false, loading: false };
    let state = {
      link: 'connecting',
      browser: { connected: false, launching: false, error: null, tabs: [], activeId: null, nav: EMPTY_NAV, dialog: null, fill: true },
      float: { open: false, ...readFloatGeometry() },
      panelVisible: 0,
      conversation: true,
      source: { width: 1280, height: 800 },
      agentActiveAt: 0,
      picking: false,
      findOpen: false,
      announce: null,
      note: null,
      toast: null,
    };
    const subscribers = new Set();
    const store = {
      get: () => state,
      set(patch) {
        const next = typeof patch === 'function' ? patch(state) : patch;
        state = { ...state, ...next };
        for (const fn of subscribers) fn();
      },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    };
    const useStore = (select) => React.useSyncExternalStore(store.subscribe, () => select(state));

    let dismissedAt = 0;
    let lastAgentAt = 0;

    const openFloat = () => {
      if (state.float.open) return;
      store.set({ float: { ...state.float, open: true } });
    };
    const closeFloat = (dismiss) => {
      if (dismiss) dismissedAt = Date.now();
      if (!state.float.open) return;
      store.set({ float: { ...state.float, open: false } });
    };
    const setFloatGeometry = (geometry, persist) => {
      store.set({ float: { ...state.float, ...geometry } });
      if (persist) writeFloatGeometry({ x: state.float.x, y: state.float.y, width: state.float.width });
    };

    // Filled in by apply(): sidebar navigation for the on-screen Session.
    const controls = {
      openTab: () => {},
      hideTab: () => {},
      onScreen: () => undefined,
      // Append text to the chat input of the Session on screen; false when there is none.
      sendToChat: () => false,
    };

    let toastTimer = 0;
    const toast = (text, tone) => {
      clearTimeout(toastTimer);
      store.set({ toast: { text, tone: tone ?? 'info' } });
      toastTimer = setTimeout(() => store.set({ toast: null }), 3500);
    };
    // Long tracking-heavy URLs (search results) bloat the chat message; keep origin + path.
    const shortUrl = (url) => {
      if (!url || url.length <= 120) return url;
      try {
        const parsed = new URL(url);
        const query = parsed.searchParams.get('q');
        return `${parsed.origin}${parsed.pathname}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
      } catch {
        return url.slice(0, 120);
      }
    };
    const shareCapture = async () => {
      try {
        const shot = await command('capture');
        const label = shot.title && !shot.title.startsWith('http') ? `${shot.title} — ${shortUrl(shot.url)}` : shortUrl(shot.url);
        const ok = controls.sendToChat(`Screenshot of the browser (${label}):\n${shot.path}`);
        toast(ok ? 'Screenshot added to the chat input' : `Screenshot saved to ${shot.path}`);
      } catch (error) {
        toast(`Screenshot failed: ${error.message}`, 'error');
      }
    };
    const setPicking = (on) => {
      if (state.picking === on) return;
      store.set({ picking: on, note: on ? null : state.note });
      if (!on) fire('pickEnd');
    };
    const zoomBy = (delta) => fire('zoom', delta === 0 ? { reset: true } : { delta });

    /** Agent activity reveals the browser when nothing shows it, T3's autoShowFloatingPreview. */
    function revealForAgent(force) {
      const now = Date.now();
      const quietBefore = now - lastAgentAt > AGENT_BURST_GAP_MS;
      lastAgentAt = now;
      store.set({ agentActiveAt: now });
      if (state.panelVisible > 0 || state.float.open) return;
      if (!force && dismissedAt > 0 && !quietBefore) return;
      openFloat();
    }

    /* --------------------------------------------------------------- transport */

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    async function readLines(response, onLine, signal) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const abort = () => reader.cancel().catch(() => {});
      signal?.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const text = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            if (!text) continue;
            let message;
            try {
              message = JSON.parse(text);
            } catch {
              continue;
            }
            onLine(message);
          }
        }
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    }

    async function command(op, args) {
      try {
        const response = await fetch(`${API}command`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op, args: args ?? {} }),
        });
        const result = await response.json();
        if (!result.ok) throw new Error(result.error || 'Command failed');
        return result.value;
      } catch (error) {
        console.warn(`[agent-browser] ${op} failed`, error);
        throw error;
      }
    }
    const fire = (op, args) => {
      command(op, args).catch(() => {});
    };

    // Input batches once per animation frame; consecutive moves and wheels coalesce.
    let inputQueue = [];
    let inputFrame = 0;
    function queueInput(event) {
      const last = inputQueue[inputQueue.length - 1];
      if (last && event.type === 'mouse' && event.action === 'move' && last.type === 'mouse' && last.action === 'move') {
        inputQueue[inputQueue.length - 1] = event;
      } else if (last && event.type === 'wheel' && last.type === 'wheel' && last.modifiers === event.modifiers) {
        inputQueue[inputQueue.length - 1] = { ...event, deltaX: last.deltaX + event.deltaX, deltaY: last.deltaY + event.deltaY };
      } else {
        inputQueue.push(event);
      }
      if (!inputFrame) inputFrame = requestAnimationFrame(flushInput);
    }
    function flushInput() {
      if (inputFrame) cancelAnimationFrame(inputFrame);
      inputFrame = 0;
      if (inputQueue.length === 0) return;
      const events = inputQueue;
      inputQueue = [];
      fetch(`${API}input`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      }).catch(() => {});
    }

    let linkAbort = null;
    function startLink() {
      if (linkAbort) return;
      const controller = new AbortController();
      linkAbort = controller;
      (async () => {
        let delay = 1000;
        while (!controller.signal.aborted) {
          try {
            const response = await fetch(`${API}events`, { cache: 'no-store', signal: controller.signal });
            if (!response.ok || !response.body) throw new Error(`events: HTTP ${response.status}`);
            store.set({ link: 'open' });
            delay = 1000;
            await readLines(response, onHostEvent, controller.signal);
          } catch {}
          if (controller.signal.aborted) break;
          store.set({ link: 'retrying' });
          await sleep(delay);
          delay = Math.min(delay * 1.6, 8000);
        }
      })();
    }
    function stopLink() {
      linkAbort?.abort();
      linkAbort = null;
    }

    function onHostEvent(event) {
      if (event.t === 'state') {
        const { t: _t, ...browser } = event;
        store.set({ browser });
        return;
      }
      if (event.t === 'server') {
        store.set({ announce: event.server });
        return;
      }
      if (event.t === 'activity' && event.by === 'agent') {
        revealForAgent(false);
        return;
      }
      if (event.t === 'reveal') {
        if (event.mode === 'sidebar') {
          closeFloat(false);
          controls.openTab();
        } else if (event.mode === 'float') {
          openFloat();
        } else if (event.mode === 'hide') {
          closeFloat(true);
        } else {
          revealForAgent(true);
        }
      }
    }

    /* ----------------------------------------------------------------- helpers */

    const hostOf = (url) => {
      try {
        const parsed = new URL(url);
        return parsed.host || parsed.protocol.replace(':', '');
      } catch {
        return url;
      }
    };
    const tabLabel = (tab) => tab.title || (tab.url === 'about:blank' ? 'New tab' : hostOf(tab.url)) || 'New tab';
    const displayUrl = (url) => (!url || url === 'about:blank' || url.startsWith('chrome://newtab') ? '' : url);
    const modifiersOf = (event) => (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
    const BUTTONS = ['left', 'middle', 'right', 'back', 'forward'];
    const buttonOf = (button) => BUTTONS[button] ?? 'none';
    const pressedButtonOf = (buttons) => (buttons & 1 ? 'left' : buttons & 4 ? 'middle' : buttons & 2 ? 'right' : 'none');
    const decodeBase64 = (data) => {
      if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(data);
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };

    function Tip({ label, children }) {
      const [at, setAt] = useState(null);
      const timer = useRef(0);
      const show = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAt({ x: rect.left + rect.width / 2, y: rect.bottom + 6 }), 450);
      };
      const hide = () => {
        clearTimeout(timer.current);
        setAt(null);
      };
      useEffect(() => () => clearTimeout(timer.current), []);
      return h(React.Fragment, null,
        React.cloneElement(children, { onMouseEnter: show, onMouseLeave: hide, onMouseDown: (e) => { hide(); children.props.onMouseDown?.(e); } }),
        at ? h('div', { className: 'lab-tooltip', style: { left: at.x, top: at.y, transform: 'translateX(-50%)' } }, label) : null);
    }

    function IconButton({ label, icon, onClick, disabled, pressed, onPointerDown }) {
      return h(Tip, { label },
        h('button', {
          type: 'button',
          className: 'lab-btn',
          'aria-label': label,
          'aria-pressed': pressed === undefined ? undefined : pressed,
          disabled,
          onClick,
          onPointerDown,
        }, icon));
    }

    /* ------------------------------------------------------------ live surface */

    /**
     * The interactive view of the viewed tab: frames drawn to a canvas, pointer and wheel mapped to
     * page coordinates, keys through a hidden textarea (IME, paste, and editing shortcuts included).
     * In the sidebar (`fill`) it sizes the page to itself; floating, it scales the page down.
     */
    function Surface({ active, fill }) {
      const wrapRef = useRef(null);
      const canvasRef = useRef(null);
      const inputRef = useRef(null);
      const metaRef = useRef({ width: 0, height: 0 });
      const [hasFrame, setHasFrame] = useState(false);
      const [focused, setFocused] = useState(false);
      const clicksRef = useRef({ button: 'none', at: 0, x: 0, y: 0, count: 0 });
      const buttonsRef = useRef(0);
      const keySentRef = useRef(false);
      const activeId = useStore((s) => s.browser.activeId);
      const fillEnabled = useStore((s) => s.browser.fill);
      const loading = useStore((s) => s.browser.nav.loading);
      const picking = useStore((s) => s.picking);

      useEffect(() => {
        setHasFrame(false);
      }, [activeId]);

      // Frames: one stream while visible, decoded off the main path, newest frame wins.
      useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        let decoding = false;
        let next = null;
        let seen = false;
        const draw = async (frame) => {
          if (decoding) {
            next = frame;
            return;
          }
          decoding = true;
          try {
            const bitmap = await createImageBitmap(new Blob([decodeBase64(frame.data)], { type: 'image/jpeg' }));
            const canvas = canvasRef.current;
            if (canvas && !controller.signal.aborted) {
              if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
              if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
              canvas.getContext('2d').drawImage(bitmap, 0, 0);
              metaRef.current = { width: frame.width || bitmap.width, height: frame.height || bitmap.height };
              const source = state.source;
              if (source.width !== metaRef.current.width || source.height !== metaRef.current.height) {
                store.set({ source: { ...metaRef.current } });
              }
              if (!seen) {
                seen = true;
                setHasFrame(true);
              }
            }
            bitmap.close();
          } catch {}
          decoding = false;
          if (next) {
            const queued = next;
            next = null;
            draw(queued);
          }
        };
        (async () => {
          let delay = 500;
          while (!controller.signal.aborted) {
            try {
              const response = await fetch(`${API}frames`, { cache: 'no-store', signal: controller.signal });
              if (!response.ok || !response.body) throw new Error(`frames: HTTP ${response.status}`);
              delay = 500;
              await readLines(response, (message) => {
                if (message.t === 'frame') draw(message);
              }, controller.signal);
            } catch {}
            if (controller.signal.aborted) break;
            await sleep(delay);
            delay = Math.min(delay * 2, 4000);
          }
        })();
        return () => controller.abort();
      }, [active]);

      // In the sidebar the page takes the panel's size, like T3's fill viewport.
      useEffect(() => {
        if (!active || !fill || !fillEnabled) return;
        const wrap = wrapRef.current;
        if (!wrap) return;
        let timer = 0;
        let last = '';
        const report = () => {
          const rect = wrap.getBoundingClientRect();
          const width = Math.floor(rect.width);
          const height = Math.floor(rect.height);
          const key = `${width}x${height}`;
          if (width < 120 || height < 120 || key === last) return;
          last = key;
          fire('resize', { width, height });
        };
        const observer = new ResizeObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(report, 120);
        });
        observer.observe(wrap);
        report();
        return () => {
          clearTimeout(timer);
          observer.disconnect();
        };
      }, [active, fill, fillEnabled, activeId]);

      const pagePoint = useCallback((clientX, clientY, clamp) => {
        const canvas = canvasRef.current;
        const meta = metaRef.current;
        if (!canvas || !canvas.width || !meta.width) return null;
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
        const contentWidth = canvas.width * scale;
        const contentHeight = canvas.height * scale;
        const left = rect.left + (rect.width - contentWidth) / 2;
        const top = rect.top + (rect.height - contentHeight) / 2;
        let x = ((clientX - left) / contentWidth) * meta.width;
        let y = ((clientY - top) / contentHeight) * meta.height;
        if (!clamp && (x < 0 || y < 0 || x > meta.width || y > meta.height)) return null;
        x = Math.max(0, Math.min(meta.width - 1, x));
        y = Math.max(0, Math.min(meta.height - 1, y));
        return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
      }, []);

      // Registered natively: React's wheel listener is passive and cannot keep the panel still.
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (event) => {
          const point = pagePoint(event.clientX, event.clientY, false);
          if (!point) return;
          event.preventDefault();
          const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? metaRef.current.height || 800 : 1;
          queueInput({ type: 'wheel', ...point, deltaX: event.deltaX * unit, deltaY: event.deltaY * unit, modifiers: modifiersOf(event) });
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
      }, [pagePoint]);

      const focusInput = () => {
        const input = inputRef.current;
        if (input && document.activeElement !== input) input.focus({ preventScroll: true });
      };

      const countClick = (button, x, y, at) => {
        const last = clicksRef.current;
        const repeat = last.button === button && at - last.at < DOUBLE_CLICK_MS && Math.hypot(x - last.x, y - last.y) < 5;
        const count = repeat ? Math.min(last.count + 1, 3) : 1;
        clicksRef.current = { button, at, x, y, count };
        return count;
      };

      const inspectRef = useRef({ at: 0, timer: 0 });
      const onPick = (event) => {
        const point = pagePoint(event.clientX, event.clientY, false);
        if (!point) return;
        if (event.type === 'pointermove') {
          // Throttle the highlight to ~12/s; the last position always lands.
          const slot = inspectRef.current;
          clearTimeout(slot.timer);
          const run = () => {
            slot.at = Date.now();
            fire('inspect', point);
          };
          if (Date.now() - slot.at > 80) run();
          else slot.timer = setTimeout(run, 80);
        } else if (event.type === 'pointerdown' && event.button === 0) {
          event.preventDefault();
          clearTimeout(inspectRef.current.timer);
          command('pick', point).then((picked) => {
            store.set({ picking: false, note: picked });
          }).catch((error) => {
            store.set({ picking: false });
            toast(`Could not pick that element: ${error.message}`, 'error');
          });
        }
      };

      const onPointer = (event) => {
        if (state.picking) {
          onPick(event);
          return;
        }
        const { type } = event;
        if (event.pointerType === 'mouse' && type === 'pointerdown' && (event.button === 3 || event.button === 4)) {
          event.preventDefault();
          fire(event.button === 3 ? 'back' : 'forward');
          return;
        }
        const dragging = buttonsRef.current !== 0;
        const point = pagePoint(event.clientX, event.clientY, dragging || type === 'pointerup');
        if (!point) return;
        const modifiers = modifiersOf(event);
        if (type === 'pointerdown') {
          event.preventDefault();
          focusInput();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const button = buttonOf(event.button);
          buttonsRef.current = event.buttons & 7;
          const clickCount = countClick(button, event.clientX, event.clientY, event.timeStamp);
          queueInput({ type: 'mouse', action: 'move', ...point, button: 'none', buttons: 0, modifiers });
          queueInput({ type: 'mouse', action: 'down', ...point, button, buttons: event.buttons, clickCount, modifiers });
          flushInput();
        } else if (type === 'pointerup' || type === 'pointercancel') {
          const button = buttonOf(event.button);
          if (buttonsRef.current === 0 && type === 'pointercancel') return;
          buttonsRef.current = type === 'pointercancel' ? 0 : event.buttons & 7;
          queueInput({ type: 'mouse', action: 'up', ...point, button, buttons: event.buttons, clickCount: clicksRef.current.count, modifiers });
          flushInput();
        } else {
          queueInput({ type: 'mouse', action: 'move', ...point, button: pressedButtonOf(event.buttons), buttons: event.buttons, modifiers });
        }
      };

      const resetInput = (input) => {
        keySentRef.current = false;
        input.value = INPUT_SENTINEL;
        input.setSelectionRange(INPUT_SENTINEL.length, INPUT_SENTINEL.length);
      };
      const sendPress = (key, code, keyCode, modifiers = 0) => {
        queueInput({ type: 'key', action: 'down', key, code, keyCode, modifiers });
        queueInput({ type: 'key', action: 'up', key, code, keyCode, modifiers });
        flushInput();
      };

      const onKey = (action, event) => {
        keySentRef.current = false;
        const native = event.nativeEvent;
        if (native.isComposing || event.keyCode === 229 || event.key === 'Process' || event.key === 'Unidentified' || event.key === 'Dead') return;
        if (event.key === 'Escape' && event.shiftKey) {
          event.preventDefault();
          if (action === 'down') event.currentTarget.blur();
          return;
        }
        const shortcut = event.ctrlKey || event.metaKey;
        if (event.key === 'Escape' && state.picking) {
          event.preventDefault();
          if (action === 'down') setPicking(false);
          return;
        }
        // Browser-chrome shortcuts stay with the panel: find and zoom.
        if (shortcut && !event.altKey) {
          const key = event.key.toLowerCase();
          const zoom = key === '=' || key === '+' ? 1 : key === '-' ? -1 : key === '0' ? 0 : null;
          if (key === 'f' || zoom !== null) {
            event.preventDefault();
            event.stopPropagation();
            if (action !== 'down') return;
            if (key === 'f') store.set({ findOpen: true });
            else zoomBy(zoom);
            return;
          }
        }
        // Paste arrives as a paste event with the clipboard text.
        if (shortcut && event.key.toLowerCase() === 'v') return;
        if (event.shiftKey && event.key === 'Insert') return;
        const text = shortcut ? undefined : [...event.key].length === 1 ? event.key : event.key === 'Enter' ? '\r' : undefined;
        queueInput({
          type: 'key',
          action,
          key: event.key,
          code: event.code,
          keyCode: event.keyCode,
          ...(action === 'down' && text !== undefined ? { text } : {}),
          modifiers: modifiersOf(event),
        });
        flushInput();
        keySentRef.current = action === 'down' && !shortcut && (text !== undefined || event.key === 'Backspace' || event.key === 'Delete');
        // Copy and cut run inside the page (Chrome shares the system clipboard).
        if (shortcut && !event.altKey && ['c', 'x', 'a', 'z'].includes(event.key.toLowerCase())) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (shortcut) return;
        event.preventDefault();
        event.stopPropagation();
      };

      const onInput = (event) => {
        const native = event.nativeEvent;
        if (native.isComposing) return;
        const input = event.currentTarget;
        if (keySentRef.current) keySentRef.current = false;
        else if (native.inputType === 'deleteContentBackward') sendPress('Backspace', 'Backspace', 8);
        else if (native.inputType === 'deleteContentForward') sendPress('Delete', 'Delete', 46);
        else {
          const text = input.value.replace(/^​/, '');
          if (text) {
            queueInput({ type: 'text', text });
            flushInput();
          }
        }
        resetInput(input);
      };

      const showCover = !hasFrame;
      return h('div', {
        ref: wrapRef,
        className: 'lab-surface',
        'data-focused': focused ? 'true' : undefined,
        onContextMenu: (event) => event.preventDefault(),
      },
        h('canvas', {
          ref: canvasRef,
          onPointerDown: onPointer,
          onPointerMove: onPointer,
          onPointerUp: onPointer,
          onPointerCancel: onPointer,
          onMouseDown: (event) => event.preventDefault(),
          onPointerLeave: () => {
            if (state.picking) fire('pickEnd');
          },
          style: { visibility: hasFrame ? 'visible' : 'hidden', cursor: picking ? 'crosshair' : undefined },
        }),
        h('textarea', {
          ref: inputRef,
          className: 'lab-input',
          'aria-label': 'Browser page',
          'aria-description': 'Press Shift+Escape to leave the browser page.',
          autoCapitalize: 'off',
          autoComplete: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          defaultValue: INPUT_SENTINEL,
          tabIndex: -1,
          onFocus: (event) => {
            resetInput(event.currentTarget);
            setFocused(true);
          },
          onBlur: () => setFocused(false),
          onKeyDown: (event) => onKey('down', event),
          onKeyUp: (event) => onKey('up', event),
          onInput,
          onCompositionEnd: (event) => {
            const text = (event.data || '').replace(/^​/, '');
            if (text) {
              queueInput({ type: 'text', text });
              flushInput();
            }
            resetInput(event.currentTarget);
          },
          onCopy: (event) => event.preventDefault(),
          onCut: (event) => event.preventDefault(),
          onPaste: (event) => {
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            if (text) {
              queueInput({ type: 'text', text });
              flushInput();
            }
          },
        }),
        loading ? h('div', { className: 'lab-progress' }) : null,
        showCover ? h('div', { className: 'lab-cover' }, 'Loading page…') : null,
        h('div', { className: 'lab-surface-ring' }));
    }

    /* ---------------------------------------------------------- sidebar panel */

    function Menu({ anchor, onClose, items }) {
      const ref = useRef(null);
      useEffect(() => {
        const dismiss = (event) => {
          if (ref.current?.contains(event.target)) return;
          onClose();
        };
        const escape = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('pointerdown', dismiss, true);
        document.addEventListener('keydown', escape, true);
        return () => {
          document.removeEventListener('pointerdown', dismiss, true);
          document.removeEventListener('keydown', escape, true);
        };
      }, [onClose]);
      const width = 220;
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
      return h('div', { ref, className: 'lab-menu', role: 'menu', style: { left, top: anchor.bottom + 4, width } },
        items.map((item, index) => (item === '-'
          ? h('hr', { key: `sep${index}` })
          : h('button', {
            key: item.label,
            type: 'button',
            role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
            'aria-checked': item.checked,
            onClick: () => {
              onClose();
              item.run();
            },
          }, h('span', { className: 'lab-menu-check' }, item.checked ? Icon.check(13) : null), item.label))));
    }

    function AddressBar() {
      const nav = useStore((s) => s.browser.nav);
      const activeId = useStore((s) => s.browser.activeId);
      const [draft, setDraft] = useState(null);
      const inputRef = useRef(null);
      const shown = draft ?? displayUrl(nav.url);
      const secure = /^https:/.test(nav.url);
      useEffect(() => {
        setDraft(null);
      }, [activeId]);
      const submit = (event) => {
        event.preventDefault();
        const value = (draft ?? '').trim();
        if (!value) return;
        setDraft(null);
        inputRef.current?.blur();
        fire(activeId ? 'navigate' : 'newTab', { url: value });
      };
      return h('form', { className: 'lab-url', onSubmit: submit },
        h('span', { className: 'lab-url-icon' }, draft !== null ? Icon.search(13) : secure ? Icon.lock(12) : Icon.globe(13)),
        h('input', {
          ref: inputRef,
          value: shown,
          placeholder: 'Search or enter address',
          spellCheck: false,
          autoComplete: 'off',
          'aria-label': 'Search or enter address',
          onFocus: (event) => {
            // Select now, before the first keystroke can land, so typing replaces the address.
            event.currentTarget.select();
            setDraft(displayUrl(nav.url));
          },
          onBlur: () => setDraft(null),
          onChange: (event) => setDraft(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              setDraft(null);
              event.currentTarget.blur();
            }
          },
        }));
    }

    function ServersButton() {
      const servers = useStore((s) => s.browser.servers ?? []);
      const activeId = useStore((s) => s.browser.activeId);
      const [menu, setMenu] = useState(null);
      const closeMenu = useCallback(() => setMenu(null), []);
      if (servers.length === 0) return null;
      return h(React.Fragment, null,
        h(IconButton, {
          label: `Local servers (${servers.length})`,
          icon: Icon.server(15),
          onClick: (event) => setMenu(event.currentTarget.getBoundingClientRect()),
        }),
        menu ? h(Menu, {
          anchor: menu,
          onClose: closeMenu,
          items: servers.flatMap((server) => [
            { label: `${server.url.replace('http://', '')}${server.title ? ` — ${server.title}` : ''}`, run: () => fire(activeId ? 'navigate' : 'newTab', { url: server.url }) },
          ]).concat(['-', { label: 'Rescan', run: () => fire('servers') }]),
        }) : null);
    }

    function ChromeRow({ onPopOut }) {
      const nav = useStore((s) => s.browser.nav);
      const activeId = useStore((s) => s.browser.activeId);
      const fill = useStore((s) => s.browser.fill);
      const zoom = useStore((s) => s.browser.zoom ?? 1);
      const picking = useStore((s) => s.picking);
      const [menu, setMenu] = useState(null);
      const has = activeId !== null;
      const closeMenu = useCallback(() => setMenu(null), []);
      return h('div', { className: 'lab-chrome' },
        h(IconButton, { label: 'Back', icon: Icon.back(16), disabled: !nav.canGoBack, onClick: () => fire('back') }),
        h(IconButton, { label: 'Forward', icon: Icon.forward(16), disabled: !nav.canGoForward, onClick: () => fire('forward') }),
        h(IconButton, {
          label: nav.loading ? 'Stop' : 'Reload',
          icon: nav.loading ? Icon.x(16) : Icon.reload(15),
          disabled: !has,
          onClick: (event) => fire(nav.loading ? 'stop' : 'reload', { ignoreCache: event.shiftKey }),
        }),
        h(AddressBar),
        zoom !== 1 ? h(Tip, { label: 'Reset zoom' }, h('button', { type: 'button', className: 'lab-zoom', onClick: () => zoomBy(0) }, `${Math.round(zoom * 100)}%`)) : null,
        h(ServersButton),
        h(IconButton, { label: picking ? 'Cancel annotation' : 'Annotate an element', icon: Icon.pick(15), disabled: !has, pressed: picking, onClick: () => setPicking(!picking) }),
        h(IconButton, { label: 'Screenshot to chat', icon: Icon.camera(15), disabled: !has, onClick: shareCapture }),
        h(IconButton, {
          label: 'Open in system browser',
          icon: Icon.external(15),
          disabled: !has || !/^https?:/.test(nav.url),
          onClick: () => window.open(nav.url, '_blank', 'noopener'),
        }),
        h(IconButton, { label: 'Pop out preview', icon: Icon.popout(15), disabled: !has, onClick: onPopOut }),
        h(IconButton, {
          label: 'More',
          icon: Icon.more(16),
          onClick: (event) => setMenu(event.currentTarget.getBoundingClientRect()),
        }),
        menu ? h(Menu, {
          anchor: menu,
          onClose: closeMenu,
          items: [
            { label: 'New tab', run: () => fire('newTab', {}) },
            { label: 'Find in page  ⌘F', run: () => store.set({ findOpen: true }) },
            { label: 'Reload ignoring cache', run: () => fire('reload', { ignoreCache: true }) },
            { label: 'Copy page address', run: () => navigator.clipboard?.writeText(nav.url).catch(() => {}) },
            '-',
            { label: `Zoom in  ⌘+   (${Math.round(zoom * 100)}%)`, run: () => zoomBy(1) },
            { label: 'Zoom out  ⌘−', run: () => zoomBy(-1) },
            { label: 'Actual size  ⌘0', run: () => zoomBy(0) },
            { label: 'Fit page to panel', checked: fill, run: () => fire('setFill', { fill: !fill }) },
            '-',
            { label: 'Close tab', run: () => fire('closeTab', {}) },
          ],
        }) : null);
    }

    function TabStrip() {
      const tabs = useStore((s) => s.browser.tabs);
      const activeId = useStore((s) => s.browser.activeId);
      if (tabs.length < 2) return null;
      return h('div', { className: 'lab-tabs', role: 'tablist' },
        tabs.map((tab) => h('div', {
          key: tab.id,
          role: 'tab',
          tabIndex: 0,
          className: 'lab-tab',
          title: `${tabLabel(tab)}\n${tab.url}`,
          'aria-selected': tab.id === activeId,
          onClick: () => fire('activate', { targetId: tab.id }),
          onAuxClick: (event) => {
            if (event.button === 1) fire('closeTab', { targetId: tab.id });
          },
        },
          h('span', { className: 'lab-tab-title' }, tabLabel(tab)),
          h('span', {
            className: 'lab-tab-x',
            role: 'button',
            'aria-label': 'Close tab',
            onClick: (event) => {
              event.stopPropagation();
              fire('closeTab', { targetId: tab.id });
            },
          }, Icon.x(12)))),
        h(IconButton, { label: 'New tab', icon: Icon.plus(14), onClick: () => fire('newTab', {}) }));
    }

    function StartCard({ title, body, action, busy, error, run }) {
      const [value, setValue] = useState('');
      const [failure, setFailure] = useState(null);
      const submit = (event) => {
        event.preventDefault();
        setFailure(null);
        command(run, value.trim() ? { url: value.trim() } : {}).catch((err) => setFailure(err.message));
      };
      return h('div', { className: 'lab-empty' },
        h('div', { className: 'lab-card' },
          h('div', { className: 'lab-card-icon' }, Icon.globe(20)),
          h('h3', null, title),
          h('p', null, body),
          h('form', { onSubmit: submit },
            h('input', {
              value,
              placeholder: 'Search or enter address',
              spellCheck: false,
              onChange: (event) => setValue(event.currentTarget.value),
            }),
            h('button', { type: 'submit', className: 'lab-primary', disabled: busy }, busy ? 'Starting…' : action)),
          failure || error ? h('div', { className: 'lab-error' }, failure || error) : null,
          h(ServerCards)));
    }

    function DialogBanner() {
      const dialog = useStore((s) => s.browser.dialog);
      const [text, setText] = useState('');
      useEffect(() => {
        setText(dialog?.defaultPrompt ?? '');
      }, [dialog]);
      if (!dialog) return null;
      const answer = (accept) => fire('dialog', { accept, ...(dialog.type === 'prompt' ? { promptText: text } : {}) });
      return h('div', { className: 'lab-dialog', role: 'alertdialog' },
        h('div', null, dialog.message || (dialog.type === 'beforeunload' ? 'Leave this page?' : 'The page is asking')),
        dialog.type === 'prompt' ? h('input', {
          className: 'lab-ghost',
          style: { textAlign: 'left' },
          value: text,
          onChange: (event) => setText(event.currentTarget.value),
        }) : null,
        h('div', { className: 'lab-dialog-row' },
          dialog.type === 'alert' ? null : h('button', { type: 'button', className: 'lab-ghost', onClick: () => answer(false) }, 'Cancel'),
          h('button', { type: 'button', className: 'lab-primary', style: { height: 28 }, onClick: () => answer(true) }, 'OK')));
    }

    function FindBar() {
      const open = useStore((s) => s.findOpen);
      const [query, setQuery] = useState('');
      const [result, setResult] = useState(null);
      const [index, setIndex] = useState(0);
      const inputRef = useRef(null);
      useEffect(() => {
        if (open) requestAnimationFrame(() => inputRef.current?.select());
      }, [open]);
      if (!open) return null;
      const run = async (backwards, reset) => {
        if (!query) return;
        try {
          const found = await command('find', { query, backwards, reset });
          setResult(found);
          setIndex((current) => {
            if (!found.count) return 0;
            if (reset) return 1;
            return backwards ? (current <= 1 ? found.count : current - 1) : current >= found.count ? 1 : current + 1;
          });
        } catch {}
      };
      const close = () => {
        store.set({ findOpen: false });
        setResult(null);
        fire('findEnd');
      };
      return h('div', { className: 'lab-find', role: 'search' },
        h('input', {
          ref: inputRef,
          value: query,
          placeholder: 'Find in page',
          'aria-label': 'Find in page',
          onChange: (event) => {
            setQuery(event.currentTarget.value);
            setResult(null);
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              run(event.shiftKey, result === null);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
            }
          },
        }),
        h('span', { className: 'lab-find-count' }, result === null ? '' : result.count ? `${index}/${result.count}` : 'No results'),
        h(IconButton, { label: 'Previous match', icon: Icon.up(14), disabled: !query, onClick: () => run(true, result === null) }),
        h(IconButton, { label: 'Next match', icon: Icon.down(14), disabled: !query, onClick: () => run(false, result === null) }),
        h(IconButton, { label: 'Close find', icon: Icon.x(14), onClick: close }));
    }

    function ServerBanner() {
      const server = useStore((s) => s.announce);
      const activeUrl = useStore((s) => s.browser.nav.url);
      const activeId = useStore((s) => s.browser.activeId);
      useEffect(() => {
        if (!server) return;
        const timer = setTimeout(() => store.set({ announce: null }), 30_000);
        return () => clearTimeout(timer);
      }, [server]);
      if (!server || activeUrl.startsWith(server.url)) return null;
      return h('div', { className: 'lab-banner', role: 'status' },
        h('span', { className: 'lab-server-dot' }),
        h('span', { className: 'lab-banner-text' }, 'Dev server started on ', h('b', null, server.url.replace('http://', '')), server.title ? ` · ${server.title}` : ''),
        h('button', {
          type: 'button',
          className: 'lab-primary',
          style: { height: 28 },
          onClick: () => {
            store.set({ announce: null });
            fire(activeId ? 'navigate' : 'newTab', { url: server.url });
          },
        }, 'Open'),
        h(IconButton, { label: 'Dismiss', icon: Icon.x(14), onClick: () => store.set({ announce: null }) }));
    }

    /** After a pick: show what was picked, take an optional note, then hand it to the chat. */
    function NotePopover() {
      const note = useStore((s) => s.note);
      const [text, setText] = useState('');
      const areaRef = useRef(null);
      useEffect(() => {
        setText('');
        if (note) requestAnimationFrame(() => areaRef.current?.focus());
      }, [note]);
      if (!note) return null;
      const el = note.element ?? {};
      const tag = `<${el.tag ?? 'element'}${el.id ? `#${el.id}` : ''}${el.classes?.length ? `.${el.classes.slice(0, 3).join('.')}` : ''}>`;
      const send = () => {
        const lines = [`Browser element on ${shortUrl(note.url)}`, `${tag}${el.text ? ` "${el.text.slice(0, 160)}"` : ''}`];
        if (el.selector) lines.push(`Selector: ${el.selector}`);
        const attrs = Object.entries(el.attrs ?? {}).map(([key, value]) => `${key}="${value}"`).join(' ');
        if (attrs) lines.push(`Attributes: ${attrs}`);
        if (note.path) lines.push(`Screenshot: ${note.path}`);
        if (text.trim()) lines.push(`Note: ${text.trim()}`);
        const ok = controls.sendToChat(lines.join('\n'));
        store.set({ note: null });
        toast(ok ? 'Element added to the chat input' : 'No chat is open to add it to', ok ? 'info' : 'error');
      };
      return h('div', { className: 'lab-note', role: 'dialog', 'aria-label': 'Annotate element' },
        h('div', { className: 'lab-note-head' },
          note.path ? h('img', { className: 'lab-note-thumb', alt: '', src: `${API}capture?path=${encodeURIComponent(note.path)}` }) : null,
          h('div', { style: { minWidth: 0, flex: 1 } },
            h('div', { className: 'lab-note-tag' }, tag),
            el.text ? h('div', { className: 'lab-note-text' }, el.text) : null)),
        h('textarea', {
          ref: areaRef,
          value: text,
          placeholder: 'What should change here? (optional)',
          onChange: (event) => setText(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              store.set({ note: null });
            }
          },
        }),
        h('div', { className: 'lab-dialog-row' },
          h('button', { type: 'button', className: 'lab-ghost', onClick: () => store.set({ note: null }) }, 'Cancel'),
          h('button', { type: 'button', className: 'lab-ghost', onClick: () => store.set({ note: null, picking: true }) }, 'Pick again'),
          h('button', { type: 'button', className: 'lab-primary', style: { height: 28 }, onClick: send }, 'Add to chat  ⌘↵')));
    }

    function StageToast() {
      const message = useStore((s) => s.toast);
      if (!message) return null;
      return h('div', { className: 'lab-pickhint', role: 'status', style: { top: 'auto', bottom: 12, color: message.tone === 'error' ? 'var(--dsw-alias-state-error-primary)' : undefined } }, message.text);
    }

    function ServerCards() {
      const servers = useStore((s) => s.browser.servers ?? []);
      const connected = useStore((s) => s.browser.connected);
      if (servers.length === 0) return null;
      return h('div', { className: 'lab-servers' },
        servers.map((server) => h('button', {
          key: server.port,
          type: 'button',
          className: 'lab-server',
          onClick: () => fire(connected ? 'newTab' : 'start', { url: server.url }),
        },
          h('span', { className: 'lab-server-dot' }),
          h('span', { className: 'lab-server-main' },
            h('span', { className: 'lab-server-title' }, server.title || server.url.replace('http://', '')),
            h('span', null, `${server.url.replace('http://', '')} · ${server.command}`)))));
    }

    function Stage({ active, fill }) {
      const link = useStore((s) => s.link);
      const connected = useStore((s) => s.browser.connected);
      const launching = useStore((s) => s.browser.launching);
      const error = useStore((s) => s.browser.error);
      const hasTab = useStore((s) => s.browser.activeId !== null);
      let content;
      if (link !== 'open' && !connected) {
        content = h('div', { className: 'lab-cover' }, link === 'connecting' ? 'Connecting…' : 'Reconnecting to DSH…');
      } else if (!connected) {
        content = h(StartCard, {
          title: "The browser isn't running",
          body: 'Start the agent browser to use it here. The agent drives this same browser, so you can watch it work and take over at any time.',
          action: 'Start',
          busy: launching,
          error,
          run: 'start',
        });
      } else if (!hasTab) {
        content = h(StartCard, { title: 'No tabs open', body: 'Open a page to start browsing.', action: 'Open', run: 'newTab' });
      } else {
        content = h(Surface, { active, fill });
      }
      const picking = useStore((s) => s.picking);
      const ready = connected && hasTab;
      return h('div', { className: 'lab-stage' },
        content,
        ready ? h(DialogBanner) : null,
        ready ? h(FindBar) : null,
        ready && picking ? h('div', { className: 'lab-pickhint' }, 'Click an element to annotate it · Esc to cancel') : null,
        ready ? h(NotePopover) : null,
        ready ? h(ServerBanner) : null,
        h(StageToast));
    }

    function Panel({ active, onPopOut }) {
      const connected = useStore((s) => s.browser.connected);
      return h('div', { className: 'lab' },
        connected ? h(TabStrip) : null,
        h(ChromeRow, { onPopOut }),
        h(Stage, { active, fill: true }));
    }

    /** The right-sidebar tab body. Collapsing the sidebar while it shows floats the browser. */
    function Body({ sessionId, useTabInfo }) {
      const info = useTabInfo();
      const visible = info.tab.visible;
      const expanded = info.sidebar.expanded;
      const signal = info.tab.signal;
      const tabId = info.tab.id;
      const previous = useRef({ visible, expanded });

      useEffect(() => {
        if (!visible) return;
        store.set((s) => ({ panelVisible: s.panelVisible + 1 }));
        closeFloat(false);
        return () => store.set((s) => ({ panelVisible: Math.max(0, s.panelVisible - 1) }));
      }, [visible]);

      useEffect(() => {
        const was = previous.current;
        previous.current = { visible, expanded };
        if (!(was.visible && !visible && was.expanded && !expanded)) return;
        // Closing the tab also collapses an emptied column; only a collapse that leaves this tab
        // open, in the Session on screen, hands the browser to the floating player.
        const timer = setTimeout(() => {
          if (signal?.aborted) return;
          if (controls.onScreen() !== undefined && controls.onScreen() !== sessionId) return;
          openFloat();
        }, 80);
        return () => clearTimeout(timer);
      }, [visible, expanded, signal, sessionId]);

      const popOut = () => {
        openFloat();
        controls.hideTab(tabId);
      };
      return h(Panel, { active: visible, onPopOut: popOut });
    }

    /* ------------------------------------------------------- floating player */

    const RESIZE_HANDLES = [
      { dir: 'n', style: { left: 0, right: 0, top: -4, height: 8, cursor: 'ns-resize' } },
      { dir: 's', style: { left: 0, right: 0, bottom: -4, height: 8, cursor: 'ns-resize' } },
      { dir: 'w', style: { top: 0, bottom: 0, left: -4, width: 8, cursor: 'ew-resize' } },
      { dir: 'e', style: { top: 0, bottom: 0, right: -4, width: 8, cursor: 'ew-resize' } },
      { dir: 'nw', style: { left: -6, top: -6, width: 14, height: 14, cursor: 'nwse-resize' } },
      { dir: 'ne', style: { right: -6, top: -6, width: 14, height: 14, cursor: 'nesw-resize' } },
      { dir: 'sw', style: { left: -6, bottom: -6, width: 14, height: 14, cursor: 'nesw-resize' } },
      { dir: 'se', style: { right: -6, bottom: -6, width: 14, height: 14, cursor: 'nwse-resize' } },
    ];

    const viewportBox = () => ({ width: window.innerWidth, height: window.innerHeight });
    const topClearance = () => {
      const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-top-clearance'));
      return Number.isFinite(value) && value > 0 ? value : 48;
    };

    /** Size and place the player inside the window, keeping the page's aspect ratio. */
    function resolveFrame(geometry, source) {
      const box = viewportBox();
      const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 10;
      const minWidth = Math.max(FLOAT_MIN_WIDTH, FLOAT_MIN_HEIGHT * aspect);
      const maxWidth = Math.max(minWidth, Math.min(box.width - EDGE_GAP * 2, (box.height - EDGE_GAP * 2 - topClearance()) * aspect));
      const width = Math.round(Math.min(Math.max(geometry.width ?? FLOAT_DEFAULT_WIDTH, minWidth), maxWidth));
      const height = Math.round(width / aspect);
      const minY = EDGE_GAP + (geometry.y === null ? topClearance() : 0);
      const x = Math.round(Math.min(Math.max(geometry.x ?? box.width - EDGE_GAP - width, EDGE_GAP), Math.max(EDGE_GAP, box.width - width - EDGE_GAP)));
      const y = Math.round(Math.min(Math.max(geometry.y ?? topClearance() + EDGE_GAP, minY), Math.max(EDGE_GAP, box.height - height - EDGE_GAP)));
      return { x, y, width, height, aspect, minWidth, maxWidth };
    }

    function FloatPlayer() {
      const show = useStore((s) => s.float.open && s.panelVisible === 0 && s.conversation && s.browser.connected && s.browser.activeId !== null);
      const geometry = useStore((s) => s.float);
      const source = useStore((s) => s.source);
      const title = useStore((s) => {
        const tab = s.browser.tabs.find((item) => item.id === s.browser.activeId);
        return tab ? tabLabel(tab) : '';
      });
      const agentActiveAt = useStore((s) => s.agentActiveAt);
      const agentBusy = Date.now() - agentActiveAt < 4000;
      const [, setTick] = useState(0);
      const [dragging, setDragging] = useState(false);
      const [pillOpen, setPillOpen] = useState(false);
      const gestureRef = useRef(null);
      const playerRef = useRef(null);

      useEffect(() => {
        if (!show) return;
        const onResize = () => setTick((n) => n + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [show]);

      // Refresh the agent pulse when it lapses.
      useEffect(() => {
        if (!agentBusy) return;
        const timer = setTimeout(() => setTick((n) => n + 1), 4100);
        return () => clearTimeout(timer);
      }, [agentBusy]);

      useEffect(() => {
        if (!pillOpen) return;
        const dismiss = (event) => {
          if (playerRef.current?.contains(event.target)) return;
          setPillOpen(false);
        };
        document.addEventListener('pointerdown', dismiss, true);
        return () => document.removeEventListener('pointerdown', dismiss, true);
      }, [pillOpen]);

      if (!show) return null;
      const frame = resolveFrame(geometry, source);

      const begin = (event, dir) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, frame, dir, moved: false, touch: event.pointerType === 'touch' };
      };
      const move = (event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
        if (!gesture.moved) {
          gesture.moved = true;
          setDragging(true);
        }
        const start = gesture.frame;
        if (gesture.dir === null) {
          setFloatGeometry({ x: start.x + dx, y: start.y + dy, width: start.width }, false);
          return;
        }
        const east = gesture.dir.includes('e');
        const west = gesture.dir.includes('w');
        const north = gesture.dir.includes('n');
        const south = gesture.dir.includes('s');
        const horizontal = east || west;
        const vertical = north || south;
        const desiredWidth = start.width + (east ? dx : west ? -dx : 0);
        const desiredHeight = start.height + (south ? dy : north ? -dy : 0);
        const aspect = start.aspect;
        // Project a corner drag onto the aspect-ratio diagonal so neither axis jumps (T3's rule).
        const desired = horizontal && vertical
          ? (desiredWidth + desiredHeight / aspect) / (1 + 1 / (aspect * aspect))
          : horizontal ? desiredWidth : desiredHeight * aspect;
        const width = Math.min(Math.max(desired, start.minWidth), start.maxWidth);
        const height = width / start.aspect;
        setFloatGeometry({
          width,
          x: west ? start.x + start.width - width : start.x,
          y: north ? start.y + start.height - height : start.y,
        }, false);
      };
      const end = (event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        gestureRef.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (gesture.moved) {
          const settled = resolveFrame(state.float, state.source);
          setFloatGeometry({ x: settled.x, y: settled.y, width: settled.width }, true);
        } else if (gesture.touch && gesture.dir === null) {
          setPillOpen((open) => !open);
        }
      };

      const openInSidebar = () => {
        closeFloat(false);
        controls.openTab();
      };
      const stop = (event) => event.stopPropagation();

      return h('div', { className: 'lab-float-layer' },
        h('section', {
          ref: playerRef,
          className: 'lab-float',
          'aria-label': 'Floating browser preview',
          'data-dragging': dragging ? 'true' : undefined,
          'data-pill': pillOpen ? 'true' : undefined,
          style: { left: frame.x, top: frame.y, width: frame.width, height: frame.height },
        },
          h('div', { className: 'lab-float-clip' }, h(Surface, { active: true, fill: false })),
          h('div', { className: 'lab-float-ring' }),
          h('div', {
            className: 'lab-handle',
            onPointerDown: (event) => begin(event, null),
            onPointerMove: move,
            onPointerUp: end,
            onPointerCancel: end,
          },
            h('span', { className: 'lab-handle-dot', 'data-agent': agentBusy ? 'true' : undefined }),
            h('div', { className: 'lab-pill', title: title || undefined },
              h('span', { className: 'lab-pill-grip', 'aria-hidden': true }, Icon.grip(14)),
              h(IconButton, { label: 'Open in sidebar', icon: Icon.panelRight(15), onPointerDown: stop, onClick: openInSidebar }),
              h(IconButton, { label: 'Close floating preview', icon: Icon.x(15), onPointerDown: stop, onClick: () => closeFloat(true) }))),
          RESIZE_HANDLES.map(({ dir, style }) => h('div', {
            key: dir,
            className: 'lab-resize',
            role: 'presentation',
            style,
            onPointerDown: (event) => begin(event, dir),
            onPointerMove: move,
            onPointerUp: end,
            onPointerCancel: end,
          }))));
    }

    /** Root overlay: owns the Host event link for the whole window and draws the floating player. */
    function Overlay() {
      useEffect(() => {
        startLink();
        return () => stopLink();
      }, []);
      return h(FloatPlayer);
    }

    /* ------------------------------------------------------ header toggle */

    function HeaderButton({ toggle }) {
      const visible = useStore((s) => s.panelVisible > 0 || s.float.open);
      return h(P.Tooltip, { label: 'Browser', side: 'bottom' },
        h(P.Button, { size: 'sm', 'aria-label': 'Browser', 'aria-pressed': visible, onClick: toggle },
          h('span', { style: { display: 'inline-flex', opacity: visible ? 1 : 0.85 } }, Icon.globe(16))));
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'sessions'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = ID;
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'agent-browser: styles');

        controls.openTab = () => {
          try {
            ctx.sidebarRight.openTab(KIND);
          } catch (error) {
            console.warn('[agent-browser] could not open the sidebar tab', error);
          }
        };
        controls.hideTab = (tabId) => {
          try {
            ctx.sidebarRight.hide(tabId);
          } catch {}
        };
        controls.sendToChat = (text) => {
          try {
            const sessionId = controls.onScreen();
            if (!sessionId) return false;
            const scope = ctx.sessions.scope(sessionId);
            const input = ctx.get('conversation')?.input?.for(scope);
            if (!input || typeof input.setDraft !== 'function') return false;
            let draft = '';
            try {
              draft = typeof input.draft === 'string' ? input.draft : input.state?.getSnapshot?.()?.draft ?? '';
            } catch {}
            if (typeof draft !== 'string') draft = draft?.text ?? '';
            input.setDraft(draft ? `${draft.replace(/\s+$/, '')}\n\n${text}` : text);
            return true;
          } catch (error) {
            console.warn('[agent-browser] could not add to the chat input', error);
            return false;
          }
        };
        controls.onScreen = () => {
          try {
            return ctx.sidebarRight.mounted?.getSnapshot?.();
          } catch {
            return undefined;
          }
        };

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          title: () => 'Browser',
          // The surface keeps its stream and canvas across tab switches and collapse.
          keepMounted: true,
          guide: [{
            id: 'agent-browser',
            order: 10,
            title: () => 'Browser',
            description: () => 'Browse together with the agent',
            icon: P.GuideArtworkBrowser,
          }],
        }), 'agent-browser: sidebar tab');

        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          inject: () => ({}),
        }, Body));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'local-agent-browser.float',
          inject: () => ({}),
        }, Overlay));

        /** Header globe: show the browser, or put it away (which floats it, as in T3). */
        const toggle = (sessionId) => {
          const sidebar = ctx.sidebarRight;
          try {
            if (state.float.open && state.panelVisible === 0) {
              closeFloat(false);
              sidebar.openTab(KIND);
              return;
            }
            const tab = sidebar.tabsIn(sessionId).find((item) => item.kind === KIND);
            if (tab === undefined) {
              sidebar.openTab(KIND);
              return;
            }
            if (sidebar.isExpanded() && sidebar.active()?.id === tab.id) {
              sidebar.hide(tab.id);
              return;
            }
            if (!sidebar.isExpanded()) sidebar.toggleExpanded();
            sidebar.focus(tab.id);
          } catch (error) {
            console.warn('[agent-browser] toggle failed', error);
          }
        };
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'local-agent-browser',
          order: -8,
          inject: (sessionId) => ({ toggle: () => toggle(sessionId) }),
        }, HeaderButton));

        // The floating player belongs over the Conversation, not over global pages like Plugins.
        try {
          const layout = ctx.get('layout');
          const info = layout?.panelInfo;
          if (info?.subscribe && info?.getSnapshot) {
            const sync = () => store.set({ conversation: info.getSnapshot()?.activePanelId == null });
            ctx.effect(() => {
              sync();
              return info.subscribe(sync);
            }, 'agent-browser: main panel');
          }
        } catch {}

        // dsh-browser-cdp mounts its own watch view through a `betterSidebar` service, or else a
        // floating globe. Providing the service keeps that second view away; its "the agent used
        // a bcdp_* tool" signal becomes ours to reveal the browser.
        const betterSidebar = {
          registerTab: () => () => {},
          openTab: () => revealForAgent(false),
        };
        ctx.effect(() => ctx.reflect.provide('betterSidebar', betterSidebar), 'agent-browser: betterSidebar service');
      },
    };
  },
});
