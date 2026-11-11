window.__ModuleLoader__.load({
  id: '@local/sidebar-bottom-bar',
  factory() {
    // Expanded sidebar only: the column is a flex stack, so `order` moves the panel nav below the workspaces.
    const ROOT = '[class*="_root"]:has(> [class*="_regionArea"]):not([class*="_collapsed"])';
    // The account row is another plugin's control: it is pinned to the start of the icon row and clipped to its avatar.
    const CSS = `
${ROOT} { position: relative; }
${ROOT} > [class*="_regionArea"] { order: 1; }
${ROOT} > [class*="_logoRow"] {
  order: 2;
  margin: 6px 0 0;
  padding-top: 6px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
${ROOT} > [class*="_toast"] { order: 3; }
${ROOT} > [class*="_panelList"] {
  order: 4;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  height: 32px;
  margin: 4px 0 0;
  padding-left: 40px;
}
${ROOT} > [class*="_panelList"] [class*="_panelRow"] {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-inline: 0;
  justify-content: center;
}
${ROOT} > [class*="_panelList"] [class*="_panelTitle"] { display: none; }
${ROOT} > [class*="_panelList"] [class*="_moreAnchor"] { width: auto; flex: none; }
${ROOT} > [class*="_footArea"] {
  position: absolute;
  left: var(--dsh-sidebar-inline-padding, 8px);
  bottom: 6px;
  width: 36px;
  height: 32px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  border-radius: var(--dsw-radius-md);
}
${ROOT} > [class*="_footArea"] * {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  min-height: 0 !important;
  max-height: 32px;
  align-items: center;
}
`;
    // Icon-only rows lose their visible label; show it as a hover tooltip instead.
    function labelRows() {
      for (const row of document.querySelectorAll('[class*="_panelList"] [class*="_panelRow"]')) {
        const text = row.querySelector('[class*="_panelTitle"]')?.textContent?.trim();
        if (text && row.title !== text) row.title = text;
      }
    }
    return {
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'local-sidebar-bottom-bar';
          style.textContent = CSS;
          document.head.appendChild(style);
          labelRows();
          const observer = new MutationObserver(labelRows);
          observer.observe(document.body, { childList: true, subtree: true });
          return () => {
            observer.disconnect();
            style.remove();
          };
        }, 'sidebar-bottom-bar: layout styles');
      },
    };
  },
});
