window.__ModuleLoader__.load({
  id: '@local/workspace-labels',
  factory() {
    const ROW = '[class*="_flatList"] [role="treeitem"][data-row-key^="session:"]';
    const LABEL = 'local-ws-label';
    // "In one list" rows become two lines: a small workspace name above the chat title, like T3 Code.
    const CSS = `
${ROW} {
  flex-wrap: wrap !important;
  align-content: center;
  height: auto !important;
  min-height: 48px !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
  row-gap: 1px;
}
${ROW} > .${LABEL} {
  order: -1;
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  margin-left: var(--dsh-sidebar-label-gap, 6px);
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}
/* The 16px status slot before the title is empty for idle chats; drop it so the title lines up under the badge. */
${ROW} > [class*="_slot"]:not(:has(svg, img, canvas, [class*="_dot"])) { display: none !important; }
${ROW} > .${LABEL} span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${ROW} > .${LABEL} b {
  flex: none;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  line-height: 13px;
  color: var(--dsw-alias-link);
  background: color-mix(in srgb, var(--dsw-alias-link) 16%, transparent);
}
${ROW} > .${LABEL}[data-none] b {
  color: var(--dsw-alias-label-tertiary);
  background: transparent;
  outline: 1px dashed var(--dsw-alias-border-l4);
  outline-offset: -1px;
}
`;
    const initials = (name) => {
      const words = name.split(/[\s_\-.]+/).filter(Boolean);
      const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
      return letters.toUpperCase();
    };
    const basename = (path) => (path ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';

    return {
      inject: ['workspaces', 'sessions'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'local-workspace-labels';
          style.textContent = CSS;
          document.head.appendChild(style);

          // Same rule the app's search uses: the workspace that lists the chat, else its folder name.
          function nameFor(id) {
            for (const ws of ctx.workspaces.list.getSnapshot().items ?? []) {
              if ((ws.sessionIds ?? []).includes(id)) return ws.title;
            }
            return basename(ctx.sessions.list.getSnapshot().byId?.[id]?.cwd);
          }

          function label() {
            for (const row of document.querySelectorAll(ROW)) {
              const id = row.getAttribute('data-row-key').slice('session:'.length);
              const name = nameFor(id);
              const text = name || 'No project';
              let tag = row.querySelector(`:scope > .${LABEL}`);
              if (tag && tag.dataset.text === text) continue;
              if (!tag) {
                tag = document.createElement('div');
                tag.className = LABEL;
                tag.setAttribute('aria-hidden', 'true');
                row.prepend(tag);
              }
              const badge = document.createElement('b');
              badge.textContent = name ? initials(name) : '  ';
              const span = document.createElement('span');
              span.textContent = text;
              tag.replaceChildren(badge, span);
              tag.dataset.text = text;
              tag.toggleAttribute('data-none', !name);
            }
          }

          let queued = false;
          const schedule = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; label(); });
          };
          const observer = new MutationObserver((records) => {
            if (records.every((r) => r.target instanceof Element && r.target.closest(`.${LABEL}`))) return;
            schedule();
          });
          observer.observe(document.body, { childList: true, subtree: true });
          const offWorkspaces = ctx.workspaces.list.subscribe?.(schedule);
          const offSessions = ctx.sessions.list.subscribe?.(schedule);
          label();
          return () => {
            observer.disconnect();
            if (typeof offWorkspaces === 'function') offWorkspaces();
            if (typeof offSessions === 'function') offSessions();
            for (const tag of document.querySelectorAll(`.${LABEL}`)) tag.remove();
            style.remove();
          };
        }, 'workspace-labels: flat list labels');
      },
    };
  },
});
