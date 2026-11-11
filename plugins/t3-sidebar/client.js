window.__ModuleLoader__.load({
  id: '@local/t3-sidebar',
  factory() {
    // The sidebar column: the only element whose direct child is the workspace region.
    const ROOT = '[class*="_root"]:has(> [class*="_regionArea"])';
    const ROW = '[role="treeitem"][data-row-key^="session:"]';
    const OPEN = `${ROOT}:not([class*="_collapsed"])`;
    const CSS = `
/* No sidebar toggle button anywhere; Cmd+Shift+E (or Cmd+B) still toggles the sidebar. */
[data-sidebar-toggle] { display: none !important; }

${ROOT} { border-right: 0.5px solid var(--dsw-alias-border-l2); }

/* Expanded sidebar: drop the empty window-button strip and the New Session button (Cmd+N still works). */
${OPEN} > [class*="_topStrip"],
${OPEN} > button[class*="_newSession"] { display: none !important; }

/* The Workspaces header sits at the top: label on the left, its icons on the right; it also drags the window. */
${OPEN} [class*="_sectionHeader"] {
  height: 40px;
  margin-top: 4px !important;
  margin-bottom: 6px;
  padding-left: 10px !important;
  justify-content: flex-start !important;
  -webkit-app-region: drag;
}
/* No "Sessions"/"Workspaces" label: the search bar fills the row up to the header icons, like T3 Code. */
${OPEN} [class*="_sectionHeader"] [class*="_sectionLabel"] { display: none !important; }
${OPEN} [class*="_sectionHeader"] [class*="_searchSlot"] {
  flex: 1 1 auto !important;
  max-width: 100% !important;
  margin-left: 0 !important;
  margin-right: 6px;
}
${OPEN} [class*="_sectionHeader"] [class*="_searchSlot"] > [class*="_search"] {
  width: 100% !important;
  height: 32px !important;
  margin: 0 !important;
  padding: 0 4px 0 0 !important;
  gap: 2px;
  border: 0.5px solid var(--dsw-alias-border-l3) !important;
  border-radius: 8px !important;
  background: var(--dsw-alias-interactive-bg-hover) !important;
  cursor: text;
}
${OPEN} [class*="_sectionHeader"] [class*="_searchButton"] {
  width: 30px !important;
  height: 30px !important;
  color: var(--dsw-alias-label-tertiary) !important;
}
${OPEN} [class*="_sectionHeader"] [class*="_searchButton"]:hover { background: transparent !important; }
${OPEN} [class*="_sectionHeader"] [class*="_searchInput"] {
  opacity: 1 !important;
  pointer-events: auto !important;
  width: auto !important;
  flex: 1 1 auto;
  margin-left: -2px;
  font-size: 13px !important;
}
${OPEN} [class*="_sectionHeader"] button,
${OPEN} [class*="_sectionHeader"] input,
${OPEN} [class*="_sectionHeader"] [role="button"] { -webkit-app-region: no-drag; }

/* Chat column fills the main area like T3 Code (~64px each side) instead of the app's 88px+padding cap.
   The app writes the measured width inline on this element; an !important rule outranks that inline value. */
[style*="--dsh-conversation-column-width"] {
  --dsh-chat-user-width: max(640px, calc(var(--dsh-conversation-column-width) - 64px)) !important;
}

/* Right panel's empty state ("Start" guide) as T3 Code's "Open a surface" list: a heading over flat rows. */
[data-sidebar-right-guide] { gap: 2px !important; padding: 0 16px !important; }
[data-sidebar-right-guide]::before {
  content: "Open a surface";
  margin-bottom: 14px;
  color: var(--dsw-alias-label-primary);
  font-size: 15px;
  font-weight: 500;
}
[data-sidebar-right-guide] > [class*="_hero"] { display: none !important; }
[data-sidebar-right-guide] > [class*="_entryCell"],
[data-sidebar-right-guide] > [class*="_moreAnchor"] { width: 300px !important; max-width: 100%; }
[data-sidebar-right-guide] button[class*="_entry"] {
  width: 100% !important;
  min-height: 40px !important;
  padding: 8px 10px !important;
  gap: 12px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
}
[data-sidebar-right-guide] button[class*="_entry"]:hover,
[data-sidebar-right-guide] button[class*="_entry"][aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover) !important; }
[data-sidebar-right-guide] [class*="_entryIcon"] { width: 18px !important; height: 18px !important; }
[data-sidebar-right-guide] [class*="_entryIcon"] svg { width: 18px !important; height: 18px !important; }
[data-sidebar-right-guide] [class*="_entryDescription"] { display: none !important; }
[data-sidebar-right-guide] [class*="_entryTitle"] { font-size: 14px !important; }
/* Rows a plugin draws itself (e.g. New terminal with its shell picker) use their own "<hash>_entry" card. */
[data-sidebar-right-guide] div[class$="_entry"] {
  min-height: 40px !important;
  padding: 8px 10px !important;
  gap: 12px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
}
[data-sidebar-right-guide] div[class$="_entry"]:hover { background: var(--dsw-alias-interactive-bg-hover) !important; }
[data-sidebar-right-guide] div[class$="_entry"] > [class$="_icon"],
[data-sidebar-right-guide] div[class$="_entry"] > [class$="_icon"] svg { width: 18px !important; height: 18px !important; }
[data-sidebar-right-guide] div[class$="_entry"] [class$="_description"] { display: none !important; }

/* Session rows: a little taller, rounded, quiet selection. */
${ROOT} ${ROW} {
  height: 36px;
  border-radius: 8px;
  margin-block: 1px;
}
${ROOT} ${ROW}[aria-selected="true"] { background-color: var(--dsw-alias-interactive-bg-active); }
${ROOT} ${ROW} [class*="_time"] { font-size: 11px; }
`;
    return {
      apply(ctx) {
        ctx.effect(() => {
          // Chat fills the window: the app caps this saved width at the available space minus a small margin.
          try { localStorage.setItem('dsh.conversation.contentWidth', '100000'); } catch { /* keep the app default */ }
          window.dispatchEvent(new Event('resize'));
          const style = document.createElement('style');
          style.id = 'local-t3-sidebar';
          style.textContent = CSS;
          document.head.appendChild(style);
          // Short placeholder like T3 Code; React keeps it until its own placeholder text changes.
          const shortPlaceholder = () => {
            for (const input of document.querySelectorAll('[class*="_sectionHeader"] input[class*="_searchInput"]')) {
              if (input.placeholder !== 'Search') input.placeholder = 'Search';
            }
          };
          const observer = new MutationObserver(shortPlaceholder);
          observer.observe(document.body, { childList: true, subtree: true });
          shortPlaceholder();
          return () => {
            observer.disconnect();
            style.remove();
          };
        }, 't3-sidebar: styles');
      },
    };
  },
});
