window.__ModuleLoader__.load({
  id: '@local/session-number-shortcuts',
  factory() {
    // Session rows the sidebar currently shows, top to bottom; rows inside a collapsed workspace are skipped.
    function visibleSessionRows() {
      return Array.from(document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]'))
        .filter((row) => row.getClientRects().length > 0);
    }
    return {
      inject: ['shortcuts'],
      apply(ctx) {
        for (let n = 1; n <= 9; n++) {
          const binding = { code: `Digit${n}`, modifiers: ['primary'] };
          ctx.effect(() => ctx.shortcuts.register({
            id: `session.open-${n}`,
            label: () => `Open session ${n} in the sidebar`,
            aliases: [`switch to session ${n}`, `go to chat ${n}`],
            defaults: {
              'desktop:macos': binding,
              'desktop:windows': binding,
              'desktop:linux': binding,
            },
            regions: ['page', 'editable'],
            modals: ['sidebar'],
            resolve: () => {
              const row = visibleSessionRows()[n - 1];
              return row === undefined
                ? { status: 'blocked', reason: `No session ${n} in the sidebar` }
                : { status: 'handled', run: () => { row.click(); } };
            },
          }), `session-number-shortcuts: open ${n}`);
        }
      },
    };
  },
});
