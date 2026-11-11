window.__ModuleLoader__.load({
  id: '@local/delete-chat',
  factory() {
    const HIDDEN_KEY = 'local.deletedChats.v1';
    const readHidden = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); } };
    const writeHidden = (set) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* best effort */ } };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    return {
      inject: ['contextMenus', 'workspaces', 'sessions', 'connection'],
      apply(ctx) {
        let hidden = readHidden();
        const hideStyle = document.createElement('style');
        hideStyle.id = 'local-delete-chat-hide';

        // Deleted rows stay hidden until the app's in-memory list forgets them (next launch).
        function refreshHidden() {
          const known = ctx.sessions.list.getSnapshot().byId ?? {};
          for (const id of [...hidden]) if (!(id in known)) hidden.delete(id);
          writeHidden(hidden);
          hideStyle.textContent = hidden.size
            ? `${[...hidden].map((id) => `[data-row-key="session:${window.CSS.escape(id)}"]`).join(',\n')} { display: none !important; }`
            : '';
        }

        async function callHost(sessionId) {
          const res = await ctx.connection.rpc.call('/api', 'local-delete-chat', { method: 'deleteChat', payload: { sessionId } });
          if (!res || !res.ok) throw new Error(res?.error?.message || 'delete failed');
          return res.value;
        }

        // If the chat being deleted is open, move to another visible chat first.
        async function leaveIfOpen(id) {
          const current = Object.values(ctx.sessions.list.getSnapshot().byId ?? {}).find((s) => (s.retainedBy?.mainView ?? 0) > 0);
          if (current?.id !== id) return;
          const other = [...document.querySelectorAll('[role="treeitem"][data-row-key^="session:"]')]
            .find((row) => row.getAttribute('data-row-key') !== `session:${id}` && row.getClientRects().length > 0);
          if (other) { other.click(); await sleep(300); }
        }

        async function deleteChat(id, title) {
          const label = title ? `"${title}"` : 'this chat';
          if (!window.confirm(`Delete ${label} permanently?\n\nIts messages and local copy are removed from this Mac. This can't be undone.`)) return false;
          try {
            await leaveIfOpen(id);
            const archived = ctx.workspaces.list.getSnapshot().archivedSessionIds ?? [];
            if (!archived.includes(id)) {
              const result = await ctx.workspaces.archiveSession(id, { stopActivity: true });
              if (result && result.ok === false) throw new Error(result.error?.message || 'could not stop the chat');
            }
            await callHost(id);
            hidden.add(id);
            refreshHidden();
            return true;
          } catch (error) {
            console.warn('delete-chat failed', error);
            window.alert(`Couldn't delete the chat: ${error?.message ?? error}`);
            return false;
          }
        }

        // Shared with the Archived section plugin's trash button.
        window.__localDeleteChat = deleteChat;

        ctx.effect(() => {
          document.head.appendChild(hideStyle);
          refreshHidden();
          const off = ctx.sessions.list.subscribe?.(refreshHidden);
          return () => {
            if (typeof off === 'function') off();
            hideStyle.remove();
            if (window.__localDeleteChat === deleteChat) delete window.__localDeleteChat;
          };
        }, 'delete-chat: hidden rows');

        ctx.effect(() => ctx.contextMenus.register({
          id: 'session.local-delete',
          target: 'session',
          order: 650,
          observe: () => [ctx.workspaces.list],
          resolve: (target) => [{
            id: 'local-delete',
            label: 'Delete chat…',
            icon: { key: 'workspace.delete' },
            afterContent: true,
            run: () => { void deleteChat(target.sessionId, target.displayTitle); },
          }],
        }), 'delete-chat: session menu');
      },
    };
  },
});
