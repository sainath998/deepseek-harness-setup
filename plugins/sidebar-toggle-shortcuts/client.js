window.__ModuleLoader__.load({
  id: '@local/sidebar-toggle-shortcuts',
  factory() {
    // Extra keys for the app's own toggle commands; each one delegates to the built-in command so behavior stays identical.
    const ALIASES = [
      { id: 'sidebar.left.toggle', code: 'KeyE', label: 'Toggle left sidebar', regions: ['page', 'editable'], modals: ['sidebar'] },
      { id: 'sidebar.right.toggle', code: 'KeyB', label: 'Toggle right sidebar', regions: ['page', 'editable', 'terminal'], modals: [] },
    ];
    // The app slides both sidebars over --ds-transition-duration-slow (0.3s); shorten it inside the app frame only.
    const CSS = `[class*="_frame"]:has([class*="_regionArea"]) { --ds-transition-duration-slow: .05s; }`;
    return {
      inject: ['shortcuts'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'local-sidebar-toggle-speed';
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => { style.remove(); };
        }, 'sidebar-toggle-shortcuts: faster slide');
        for (const alias of ALIASES) {
          const binding = { code: alias.code, modifiers: ['primary', 'shift'] };
          ctx.effect(() => ctx.shortcuts.register({
            id: `${alias.id}.alt`,
            label: () => `${alias.label} (alternate)`,
            aliases: [alias.label.toLowerCase()],
            defaults: {
              'desktop:macos': binding,
              'desktop:windows': binding,
              'desktop:linux': binding,
            },
            regions: alias.regions,
            modals: alias.modals,
            resolve: (context) => {
              const target = ctx.shortcuts.registry?.commands?.get(alias.id);
              return target === undefined
                ? { status: 'blocked', reason: `${alias.label} is unavailable` }
                : target.resolve(context);
            },
          }), `sidebar-toggle-shortcuts: ${alias.id}`);
        }
      },
    };
  },
});
