window.__ModuleLoader__.load({
  id: '@local/settled-section',
  factory() {
    const STORE_KEY = 'local.settledChats.v1';
    const OPEN_KEY = 'local.settledSection.open.v1';
    const PAGE = 15;
    // New activity this long after settling moves the chat back to the main list.
    const REVIVE_AFTER_MS = 5000;
    const STYLE = `
.local-settled {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 50%;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.local-settled-head {
  display: flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 10px;
  border: 0; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px;
  cursor: pointer; text-align: left;
}
.local-settled-head:hover { background: var(--dsw-alias-interactive-bg-hover); }
.local-settled-head .grow { flex: 1; }
.local-settled-head .count { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.local-settled-head .chev { color: var(--dsw-alias-label-tertiary); }
.local-settled[data-open] .local-settled-head .chev { transform: rotate(90deg); }
.local-settled-list { overflow-y: auto; min-height: 0; padding-bottom: 4px; }
.local-settled:not([data-open]) .local-settled-list { display: none; }
.local-settled-row {
  display: flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 6px 0 10px; border-radius: 8px;
  color: var(--dsw-alias-label-secondary); font-size: 13px; cursor: pointer;
}
.local-settled-row:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.local-settled-row[data-current] { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.local-settled-row b { flex: none; width: 18px; font-size: 9px; font-weight: 700; text-align: center; color: var(--dsw-alias-label-tertiary); }
.local-settled-row .title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-settled-row .age { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.local-settled-row .act {
  display: none; flex: none; width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--dsw-alias-label-secondary); font-size: 13px; cursor: pointer;
}
.local-settled-row:hover .age { display: none; }
.local-settled-row:hover .act { display: inline-flex; align-items: center; justify-content: center; }
.local-settled-row .act:hover { background: var(--dsw-alias-interactive-bg-active); color: var(--dsw-alias-label-primary); }
.local-settled-more {
  height: 30px; padding: 0 10px; border: 0; background: transparent;
  color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.local-settled-more:hover { color: var(--dsw-alias-label-primary); }
/* Hover row action: Settle replaces Archive (Archive stays in the right-click menu). */
[role="treeitem"][data-row-key^="session:"] button[aria-label="Archive session"],
[role="treeitem"][data-row-key^="session:"] button[aria-label="Unarchive session"] { display: none !important; }
.local-settle-btn { display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); }
.local-settle-btn:hover { color: var(--dsw-alias-label-primary); }
`;
    const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; } };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best effort */ } };
    const initials = (name) => {
      const words = name.split(/[\s_\-.]+/).filter(Boolean);
      return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
    };
    const basename = (p) => (p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
    const toMs = (v) => (typeof v === 'number' ? v : Date.parse(v));
    function age(ms) {
      if (!Number.isFinite(ms)) return '';
      const s = Math.max(0, (Date.now() - ms) / 1000);
      if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
      if (s < 86400) return `${Math.round(s / 3600)}h`;
      if (s < 86400 * 30) return `${Math.round(s / 86400)}d`;
      return `${Math.round(s / (86400 * 30))}mo`;
    }

    return {
      inject: ['workspaces', 'sessions', 'contextMenus', 'uiWorkspace'],
      apply(ctx) {
        // { [sessionId]: settledAt ms }
        let settled = readJson(STORE_KEY, {});
        if (typeof settled !== 'object' || settled === null || Array.isArray(settled)) settled = {};
        let open = readJson(OPEN_KEY, true) === true;
        let shown = PAGE;
        const listeners = new Set();
        let version = 0;
        const save = () => { version++; writeJson(STORE_KEY, settled); for (const l of listeners) l(); };
        const isSettled = (id) => Object.hasOwn(settled, id);
        const settle = (id) => { settled[id] = Date.now(); save(); };
        const unsettle = (id) => { delete settled[id]; save(); };

        // Shared with other local plugins (delete-chat clears a deleted chat from here).
        window.__localSettled = { isSettled, settle, unsettle };

        const byId = () => ctx.sessions.list.getSnapshot().byId ?? {};
        const currentId = () => Object.values(byId()).find((s) => (s.retainedBy?.mainView ?? 0) > 0)?.id;

        // Forget chats that no longer exist; move a chat back when it has new activity after settling.
        function reconcile() {
          const all = byId();
          if (Object.keys(all).length === 0) return false;
          let changed = false;
          for (const [id, at] of Object.entries(settled)) {
            const s = all[id];
            if (!s) { delete settled[id]; changed = true; continue; }
            const updated = toMs(s.updatedAt);
            if (Number.isFinite(updated) && updated > at + REVIVE_AFTER_MS) { delete settled[id]; changed = true; }
          }
          if (changed) writeJson(STORE_KEY, settled);
          return changed;
        }

        const style = document.createElement('style');
        style.id = 'local-settled-section';
        style.textContent = STYLE;
        const hideStyle = document.createElement('style');
        hideStyle.id = 'local-settled-hide';

        const section = document.createElement('div');
        section.className = 'local-settled';
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'local-settled-head';
        const list = document.createElement('div');
        list.className = 'local-settled-list';
        section.append(head, list);
        head.addEventListener('click', () => { open = !open; writeJson(OPEN_KEY, open); render(); });

        function rows() {
          const all = byId();
          const items = ctx.workspaces.list.getSnapshot().items ?? [];
          return Object.keys(settled).filter((id) => all[id]).map((id) => {
            const s = all[id];
            const owner = items.find((w) => (w.sessionIds ?? []).includes(id));
            return {
              id,
              title: (!s.blank && s.title?.trim()) || 'Untitled chat',
              project: owner?.title || basename(s.cwd) || '',
              at: toMs(s.updatedAt),
            };
          }).sort((a, b) => (b.at || 0) - (a.at || 0));
        }

        function button(cls, text, title, onClick) {
          const b = Object.assign(document.createElement('button'), { type: 'button', className: cls, textContent: text, title });
          b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
          return b;
        }

        function render() {
          const items = rows();
          // Settled chats leave the main list (both views); the Settled section lists them.
          hideStyle.textContent = items.length
            ? `${items.map((r) => `[role="treeitem"][data-row-key="session:${window.CSS.escape(r.id)}"]`).join(',\n')} { display: none !important; }`
            : '';
          section.hidden = items.length === 0;
          section.toggleAttribute('data-open', open);
          head.replaceChildren(
            Object.assign(document.createElement('span'), { className: 'grow', textContent: 'Settled' }),
            Object.assign(document.createElement('span'), { className: 'count', textContent: String(items.length) }),
            Object.assign(document.createElement('span'), { className: 'chev', textContent: '›' }),
          );
          if (!open) { list.replaceChildren(); return; }
          const current = currentId();
          const nodes = items.slice(0, shown).map((r) => {
            const row = document.createElement('div');
            row.className = 'local-settled-row';
            row.toggleAttribute('data-current', r.id === current);
            row.title = r.project ? `${r.project} · ${r.title}` : r.title;
            const badge = document.createElement('b');
            badge.textContent = r.project ? initials(r.project) : '··';
            row.append(
              badge,
              Object.assign(document.createElement('span'), { className: 'title', textContent: r.title }),
              Object.assign(document.createElement('span'), { className: 'age', textContent: age(r.at) }),
              button('act', '↺', 'Move back to chats', () => unsettle(r.id)),
            );
            if (typeof window.__localDeleteChat === 'function') {
              row.append(button('act', '🗑', 'Delete permanently', () => { void window.__localDeleteChat(r.id, r.title); }));
            }
            row.addEventListener('click', () => ctx.uiWorkspace.openSession(r.id));
            return row;
          });
          if (items.length > shown) {
            nodes.push(button('local-settled-more', `Show ${Math.min(PAGE, items.length - shown)} more`, '', () => { shown += PAGE; render(); }));
          }
          list.replaceChildren(...nodes);
        }

        const SETTLE_ICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 8.2l1.9 1.9 3.6-3.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        // Put a Settle button in each chat row's hover actions, next to the row's own ⋯ button.
        function addRowButtons() {
          for (const row of document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]')) {
            const actions = row.querySelector('[class*="_rowActions"]');
            if (!actions || actions.querySelector(':scope > .local-settle-btn')) continue;
            const id = row.getAttribute('data-row-key').slice('session:'.length);
            const native = actions.querySelector('button');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `${native?.className ?? ''} local-settle-btn`.trim();
            btn.title = 'Settle';
            btn.setAttribute('aria-label', 'Settle chat');
            btn.innerHTML = SETTLE_ICON;
            btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); settle(id); });
            btn.addEventListener('pointerdown', (e) => e.stopPropagation());
            actions.appendChild(btn);
          }
        }

        // Keep the section as the last child of the sidebar's chat browser (the element holding the search header).
        function mount() {
          const header = document.querySelector('[class*="_root"]:not([class*="_collapsed"]) [class*="_regionArea"] [class*="_sectionHeader"]');
          const host = header?.parentElement;
          if (!host) { section.remove(); return; }
          if (section.parentElement !== host || host.lastElementChild !== section) host.appendChild(section);
        }

        let queued = false;
        const schedule = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => { queued = false; reconcile(); mount(); render(); addRowButtons(); });
        };
        listeners.add(schedule);

        ctx.effect(() => {
          document.head.append(style, hideStyle);
          const observer = new MutationObserver((records) => {
            if (records.every((r) => section.contains(r.target) || (r.target instanceof Element && r.target.closest('.local-settle-btn')))) return;
            schedule();
          });
          observer.observe(document.body, { childList: true, subtree: true });
          const offW = ctx.workspaces.list.subscribe?.(schedule);
          const offS = ctx.sessions.list.subscribe?.(schedule);
          schedule();
          return () => {
            observer.disconnect();
            if (typeof offW === 'function') offW();
            if (typeof offS === 'function') offS();
            listeners.delete(schedule);
            section.remove();
            style.remove();
            hideStyle.remove();
            if (window.__localSettled?.settle === settle) delete window.__localSettled;
          };
        }, 'settled-section: sidebar section');

        // Right-click → Settle / Move back to chats.
        ctx.effect(() => ctx.contextMenus.register({
          id: 'session.local-settle',
          target: 'session',
          order: 590,
          observe: () => [ctx.workspaces.list, { getSnapshot: () => version, subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); } }],
          resolve: (target) => {
            if ((ctx.workspaces.list.getSnapshot().archivedSessionIds ?? []).includes(target.sessionId)) return [];
            const done = isSettled(target.sessionId);
            return [{
              id: 'local-settle',
              label: done ? 'Move back to chats' : 'Settle',
              icon: { key: done ? 'workspace.unarchive' : 'workspace.archive' },
              separatorBefore: true,
              run: () => { (done ? unsettle : settle)(target.sessionId); },
            }];
          },
        }), 'settled-section: session menu');
      },
    };
  },
});
