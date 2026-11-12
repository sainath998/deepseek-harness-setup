window.__ModuleLoader__.load({
  id: '@local/changes',
  factory(require) {
    // T3 Code-style Changes panel for the right sidebar: the chat's git working tree against HEAD —
    // per-file diffs, revert a file or a hunk, commit (selected files), push, open a PR, switch or
    // create branches, and move the chat into a new git worktree. Git runs on the Host (index.js).
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState, useCallback, useMemo } = React;
    const P = require('@deepseek-ai/dsh-client-ui-primitives');

    const ID = '@local/changes';
    const KIND = 'local-changes';
    const API = 'api/local-changes';
    const POLL_MS = 3000;
    const BADGE_POLL_MS = 10_000;
    const AUTO_EXPAND_FILES = 6;

    const CSS = `
.lch{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.lch-top{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}
.lch-branch{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:70%;height:28px;padding:0 8px;border:none;border-radius:var(--dsw-radius-sm,6px);background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer}
.lch-branch:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lch-branch-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.lch-ab{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-variant-numeric:tabular-nums}
.lch-grow{flex:1}
.lch-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:26px;min-width:26px;padding:0 6px;border:none;border-radius:var(--dsw-radius-sm,6px);background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.lch-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lch-btn:disabled{opacity:.4;cursor:default}
.lch-btn[data-danger=true]{color:var(--dsw-alias-state-error-primary)}
.lch-summary{display:flex;align-items:center;gap:8px;padding:8px 10px 6px;flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
.lch-summary input{margin:0}
.lch-scroll{flex:1;min-height:0;overflow:auto;padding:0 0 12px}
.lch-file{border-top:.5px solid var(--dsw-alias-border-l2)}
.lch-file:first-child{border-top:none}
.lch-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-base)}
.lch-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lch-row input{margin:0;flex:none}
.lch-caret{display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .12s;flex:none}
.lch-caret[data-open=true]{transform:rotate(90deg)}
.lch-status{width:14px;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;text-align:center}
.lch-st-M{color:var(--dsw-alias-state-warn-primary)}.lch-st-A,.lch-st-\\?{color:var(--dsw-alias-state-success-primary)}.lch-st-D{color:var(--dsw-alias-state-error-primary)}.lch-st-R{color:var(--dsw-static-violet-600,#8b5cf6)}.lch-st-U{color:var(--dsw-alias-state-error-primary)}
.lch-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left;font-size:12.5px}
.lch-path bdi{direction:ltr}
.lch-dir{color:var(--dsw-alias-label-tertiary)}
.lch-count{font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.lch-add{color:var(--dsw-alias-state-success-primary,#16a34a)}.lch-del{color:var(--dsw-alias-state-error-primary,#dc2626)}
.lch-row-actions{display:none;gap:2px;flex:none}
.lch-row:hover .lch-row-actions,.lch-row:focus-within .lch-row-actions{display:inline-flex}
.lch-diff{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--dsh-code-font-size,12px);line-height:1.5;overflow-x:auto;padding-bottom:6px}
.lch-hunk-head{display:flex;align-items:center;gap:6px;padding:2px 10px;color:var(--dsw-alias-label-tertiary);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d6bfe) 7%,transparent);font-size:11.5px;position:relative}
.lch-hunk-head span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lch-hunk-head .lch-btn{height:20px;font-size:11px;opacity:0}
.lch-hunk:hover .lch-hunk-head .lch-btn{opacity:1}
.lch-line{display:flex;white-space:pre;min-width:max-content}
.lch-ln{width:38px;flex:none;text-align:right;padding-right:6px;color:var(--dsw-alias-label-tertiary);user-select:none;opacity:.8}
.lch-code{padding:0 10px 0 4px;flex:1}
.lch-line[data-kind=add]{background:var(--dsw-alias-code-diff-added,rgba(34,197,94,.14))}
.lch-line[data-kind=del]{background:var(--dsw-alias-code-diff-deleted,rgba(242,90,90,.14))}
.lch-line[data-kind=add] .lch-code::before{content:"+";position:absolute;margin-left:-9px;color:var(--dsw-alias-state-success-primary,#16a34a)}
.lch-line[data-kind=add] .lch-ln{color:var(--dsw-alias-state-success-primary,#16a34a)}
.lch-line[data-kind=del] .lch-code::before{content:"−";position:absolute;margin-left:-9px;color:var(--dsw-alias-state-error-primary,#dc2626)}
.lch-line[data-kind=del] .lch-ln{color:var(--dsw-alias-state-error-primary,#dc2626)}
.lch-note{padding:8px 12px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.lch-empty{padding:40px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.6}
.lch-empty strong{display:block;color:var(--dsw-alias-label-secondary);font-size:13.5px;font-weight:600;margin-bottom:4px}
.lch-commit{flex:none;border-top:.5px solid var(--dsw-alias-border-l2);padding:8px 10px 10px;display:flex;flex-direction:column;gap:8px}
.lch-commit textarea{width:100%;box-sizing:border-box;min-height:54px;max-height:160px;resize:vertical;padding:8px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
.lch-commit textarea:focus{border-color:var(--dsw-alias-border-l4,var(--dsw-alias-label-tertiary))}
.lch-commit-row{display:flex;align-items:center;gap:6px}
.lch-primary{height:28px;padding:0 12px;border:none;border-radius:7px;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-label-primary));color:var(--dsw-alias-label-primary-foreground,#fff);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap}
.lch-primary:disabled{opacity:.45;cursor:default}
.lch-ghost{height:28px;padding:0 10px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.lch-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.lch-ghost:disabled{opacity:.45;cursor:default}
.lch-msg{font-size:12px;line-height:1.45;word-break:break-word}
.lch-msg[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
.lch-msg[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}
.lch-msg a{color:inherit}
.lch-menu{position:fixed;z-index:60;width:280px;max-height:60vh;display:flex;flex-direction:column;padding:4px;border-radius:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgba(0,0,0,.28)}
.lch-menu input{height:30px;margin:2px 2px 4px;padding:0 8px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
.lch-menu-list{overflow:auto;min-height:0}
.lch-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;padding:4px 8px;border:none;border-radius:6px;background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.lch-menu button:hover,.lch-menu button[data-active=true]{background:var(--dsw-alias-interactive-bg-hover)}
.lch-menu-when{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.lch-menu hr{border:none;border-top:.5px solid var(--dsw-alias-border-l2);margin:4px 2px}
.lch-menu-label{padding:4px 8px 2px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.lch-badge{position:absolute;top:-2px;right:-3px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:var(--dsw-alias-state-warn-primary,#f59e0b);color:#000;font-size:9.5px;font-weight:700;line-height:14px;text-align:center;box-sizing:border-box}
`;

    /* ------------------------------------------------------------------ icons */

    const svg = (children, size = 16) => h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
    }, ...children);
    const path = (d) => h('path', { d, key: d });
    const Icon = {
      branch: (s) => svg([h('circle', { key: 1, cx: 6, cy: 6, r: 2.5 }), h('circle', { key: 2, cx: 6, cy: 18, r: 2.5 }), h('circle', { key: 3, cx: 18, cy: 8, r: 2.5 }), path('M6 8.5v7'), path('M18 10.5c0 4-6 3-11 6')], s),
      diff: (s) => svg([path('M12 3v14'), path('M5 10h14'), path('M5 21h14')], s),
      caret: (s) => svg([path('m9 18 6-6-6-6')], s),
      revert: (s) => svg([path('M3 7v6h6'), path('M21 17a9 9 0 0 0-15-6.7L3 13')], s),
      refresh: (s) => svg([path('M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'), path('M21 3v5h-5')], s),
      chevron: (s) => svg([path('m6 9 6 6 6-6')], s),
      plus: (s) => svg([path('M5 12h14'), path('M12 5v14')], s),
      tree: (s) => svg([path('M6 3v12'), h('circle', { key: 'a', cx: 18, cy: 6, r: 3 }), h('circle', { key: 'b', cx: 6, cy: 18, r: 3 }), path('M18 9a9 9 0 0 1-9 9')], s),
      check: (s) => svg([path('M20 6 9 17l-5-5')], s),
      expand: (s) => svg([path('m7 15 5 5 5-5'), path('m7 9 5-5 5 5')], s),
    };

    /* -------------------------------------------------------------- transport */

    // The chat whose folder the panel shows; sent with every call so the Host can follow the chat
    // into a worktree (its live working directory), falling back to the original folder.
    let currentSession;
    async function call(method, payload) {
      payload = { sessionId: payload?.sessionId ?? currentSession, ...payload };
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, payload }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || `${method} failed`);
      return result.value;
    }

    /* ------------------------------------------------------------- diff model */

    function parsePatch(patch) {
      const lines = patch.split('\n');
      const start = lines.findIndex((line) => line.startsWith('@@'));
      const header = start === -1 ? patch : lines.slice(0, start).join('\n');
      const hunks = [];
      let current = null;
      let oldLine = 0;
      let newLine = 0;
      for (let i = Math.max(0, start); start !== -1 && i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('@@')) {
          const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
          oldLine = Number(match?.[1] ?? 0);
          newLine = Number(match?.[2] ?? 0);
          current = { header: line, context: (match?.[3] ?? '').trim(), raw: [line], rows: [] };
          hunks.push(current);
          continue;
        }
        if (!current) continue;
        if (line === '' && i === lines.length - 1) continue;
        current.raw.push(line);
        if (line.startsWith('\\')) continue;
        const kind = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'ctx';
        current.rows.push({
          kind,
          text: line.slice(1),
          old: kind === 'add' ? '' : oldLine++,
          new: kind === 'del' ? '' : newLine++,
        });
      }
      return { header, hunks };
    }

    const splitPath = (filePath) => {
      const slash = filePath.lastIndexOf('/');
      return slash === -1 ? { dir: '', base: filePath } : { dir: filePath.slice(0, slash + 1), base: filePath.slice(slash + 1) };
    };

    /* ------------------------------------------------------------ components */

    function Confirm({ label, confirmLabel, onConfirm, danger, disabled, title, icon }) {
      const [armed, setArmed] = useState(false);
      useEffect(() => {
        if (!armed) return;
        const timer = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(timer);
      }, [armed]);
      return h('button', {
        type: 'button',
        className: 'lch-btn',
        'data-danger': armed || danger ? 'true' : undefined,
        title,
        disabled,
        onClick: (event) => {
          event.stopPropagation();
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          onConfirm();
        },
      }, icon, armed ? confirmLabel : label);
    }

    function FileDiff({ cwd, file, revision, onChanged, report }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      useEffect(() => {
        let cancelled = false;
        call('diff', { cwd, path: file.path, untracked: file.untracked })
          .then((value) => {
            if (!cancelled) {
              setData(value);
              setError(null);
            }
          })
          .catch((err) => !cancelled && setError(err.message));
        return () => {
          cancelled = true;
        };
      }, [cwd, file.path, file.untracked, revision]);
      const parsed = useMemo(() => (data ? parsePatch(data.patch) : null), [data]);
      if (error) return h('div', { className: 'lch-note', style: { color: 'var(--dsw-alias-state-error-primary)' } }, error);
      if (!parsed) return h('div', { className: 'lch-note' }, 'Loading diff…');
      if (data.binary) return h('div', { className: 'lch-note' }, 'Binary file');
      if (parsed.hunks.length === 0) return h('div', { className: 'lch-note' }, file.status === 'R' ? `Renamed from ${file.oldPath} without content changes` : 'No textual changes');
      const revertHunk = async (hunk) => {
        try {
          await call('revertHunk', { cwd, patch: `${parsed.header}\n${hunk.raw.join('\n')}\n` });
          report(`Reverted a hunk in ${file.path}`, 'ok');
          onChanged();
        } catch (err) {
          report(err.message, 'error');
        }
      };
      return h('div', { className: 'lch-diff' },
        parsed.hunks.map((hunk, index) => h('div', { key: index, className: 'lch-hunk' },
          h('div', { className: 'lch-hunk-head' },
            h('span', null, hunk.header.replace(/@@.*@@/, (m) => m) ),
            file.untracked ? null : h(Confirm, { label: 'Revert hunk', confirmLabel: 'Confirm revert', icon: Icon.revert(12), onConfirm: () => revertHunk(hunk) })),
          hunk.rows.map((row, rowIndex) => h('div', { key: rowIndex, className: 'lch-line', 'data-kind': row.kind },
            h('span', { className: 'lch-ln' }, row.old),
            h('span', { className: 'lch-ln' }, row.new),
            h('span', { className: 'lch-code', style: { position: 'relative' } }, row.text || ' '))))),
        data.truncated ? h('div', { className: 'lch-note' }, 'Diff truncated (too large to show in full)') : null);
    }

    function FileRow({ cwd, file, open, selected, onToggle, onSelect, revision, onChanged, report }) {
      const { dir, base } = splitPath(file.path);
      const revert = async () => {
        try {
          await call('revertFile', { cwd, path: file.path, oldPath: file.oldPath, untracked: file.untracked });
          report(file.untracked ? `Deleted ${file.path}` : `Reverted ${file.path}`, 'ok');
          onChanged();
        } catch (err) {
          report(err.message, 'error');
        }
      };
      return h('div', { className: 'lch-file' },
        h('div', { className: 'lch-row', onClick: onToggle, role: 'button', 'aria-expanded': open, title: file.oldPath ? `${file.oldPath} → ${file.path}` : file.path },
          h('input', { type: 'checkbox', checked: selected, 'aria-label': `Include ${file.path} in the commit`, onClick: (event) => event.stopPropagation(), onChange: (event) => onSelect(event.currentTarget.checked) }),
          h('span', { className: 'lch-caret', 'data-open': open ? 'true' : undefined }, Icon.caret(12)),
          h('span', { className: `lch-status lch-st-${file.status}` }, file.status === '?' ? 'U' : file.status),
          h('span', { className: 'lch-path' }, h('bdi', null, h('span', { className: 'lch-dir' }, dir), base)),
          h('span', { className: 'lch-row-actions' },
            h(Confirm, { label: '', confirmLabel: file.untracked ? 'Delete?' : 'Revert?', icon: Icon.revert(13), title: file.untracked ? 'Delete this new file' : 'Revert this file', onConfirm: revert })),
          h('span', { className: 'lch-count' },
            file.binary ? h('span', { className: 'lch-dir' }, 'bin') : [
              h('span', { key: 'a', className: 'lch-add' }, `+${file.added ?? 0}`), ' ',
              h('span', { key: 'd', className: 'lch-del' }, `−${file.removed ?? 0}`),
            ])),
        open ? h(FileDiff, { cwd, file, revision, onChanged, report }) : null);
    }

    function BranchMenu({ anchor, cwd, sessionId, onClose, onChanged, report }) {
      const ref = useRef(null);
      const [query, setQuery] = useState('');
      const [list, setList] = useState(null);
      useEffect(() => {
        call('branches', { cwd }).then(setList).catch((err) => report(err.message, 'error'));
      }, [cwd]);
      useEffect(() => {
        const dismiss = (event) => {
          if (!ref.current?.contains(event.target)) onClose();
        };
        document.addEventListener('pointerdown', dismiss, true);
        return () => document.removeEventListener('pointerdown', dismiss, true);
      }, [onClose]);
      const name = query.trim();
      const branches = (list?.branches ?? []).filter((branch) => branch.name.toLowerCase().includes(name.toLowerCase()));
      const exact = (list?.branches ?? []).some((branch) => branch.name === name);
      const act = async (label, fn) => {
        onClose();
        try {
          await fn();
          report(label, 'ok');
          onChanged();
        } catch (err) {
          report(err.message, 'error');
        }
      };
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 288));
      return h('div', { ref, className: 'lch-menu', style: { left, top: anchor.bottom + 4 } },
        h('input', {
          autoFocus: true,
          value: query,
          placeholder: 'Switch, create branch, or name a worktree',
          onChange: (event) => setQuery(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter' && name) {
              if (exact) act(`Switched to ${name}`, () => call('checkout', { cwd, branch: name }));
              else act(`Created and switched to ${name}`, () => call('checkout', { cwd, branch: name, create: true }));
            }
          },
        }),
        h('div', { className: 'lch-menu-list' },
          name && !exact ? h('button', { type: 'button', onClick: () => act(`Created and switched to ${name}`, () => call('checkout', { cwd, branch: name, create: true })) },
            Icon.plus(14), `Create branch "${name}"`) : null,
          list === null ? h('div', { className: 'lch-menu-label' }, 'Loading branches…') : null,
          branches.map((branch) => h('button', {
            key: branch.name,
            type: 'button',
            'data-active': branch.name === list?.current ? 'true' : undefined,
            onClick: () => branch.name === list?.current ? onClose() : act(`Switched to ${branch.name}`, () => call('checkout', { cwd, branch: branch.name })),
          }, branch.name === list?.current ? Icon.check(14) : h('span', { style: { width: 14 } }), branch.name, h('span', { className: 'lch-menu-when' }, branch.when))),
          h('hr'),
          h('button', {
            type: 'button',
            disabled: !sessionId,
            onClick: () => act(name ? `This chat now works in worktree "${name}"` : 'This chat now works in a new worktree', async () => {
              const created = await call('worktree', { sessionId, name });
              return created;
            }),
          }, Icon.tree(14), name ? `New worktree "${name}" for this chat` : 'New worktree for this chat')));
    }

    function CommitBox({ cwd, status, selected, onChanged, report }) {
      const [message, setMessage] = useState('');
      const [busy, setBusy] = useState(null);
      const files = status.files ?? [];
      const chosen = files.filter((file) => selected.has(file.path));
      const ahead = status.branch?.ahead ?? 0;
      const upstream = status.branch?.upstream;
      const run = async (label, steps) => {
        setBusy(label);
        try {
          const outcome = await steps();
          onChanged();
          return outcome;
        } catch (err) {
          report(err.message, 'error');
          return undefined;
        } finally {
          setBusy(null);
        }
      };
      const commitPaths = () => chosen.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path]));
      const commit = (andPush, andPr) => run(andPr ? 'Creating PR…' : andPush ? 'Pushing…' : 'Committing…', async () => {
        const all = chosen.length === files.length;
        const { sha } = await call('commit', { cwd, message, paths: all ? [] : commitPaths() });
        setMessage('');
        if (andPr) {
          const pr = await call('createPr', { cwd, title: message.split('\n')[0], body: message.split('\n').slice(1).join('\n').trim() });
          report(h('span', null, `Committed ${sha} and ${pr.existed ? 'pushed to the open PR' : 'opened a PR'}: `, h('a', { href: pr.url, target: '_blank', rel: 'noopener' }, pr.url)), 'ok');
        } else if (andPush) {
          await call('push', { cwd });
          report(`Committed ${sha} and pushed`, 'ok');
        } else {
          report(`Committed ${sha}`, 'ok');
        }
      });
      const canCommit = message.trim() !== '' && chosen.length > 0 && !busy;
      return h('div', { className: 'lch-commit' },
        files.length > 0 ? h('textarea', {
          value: message,
          placeholder: `Commit message (${chosen.length} of ${files.length} file${files.length === 1 ? '' : 's'})`,
          onChange: (event) => setMessage(event.currentTarget.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canCommit) {
              event.preventDefault();
              commit(false, false);
            }
          },
        }) : null,
        h('div', { className: 'lch-commit-row' },
          files.length > 0 ? h('button', { type: 'button', className: 'lch-primary', disabled: !canCommit, onClick: () => commit(false, false) }, busy === 'Committing…' ? busy : 'Commit') : null,
          files.length > 0 && status.hasRemote ? h('button', { type: 'button', className: 'lch-ghost', disabled: !canCommit, onClick: () => commit(true, false) }, busy === 'Pushing…' ? busy : 'Commit & push') : null,
          files.length > 0 && status.hasRemote ? h('button', { type: 'button', className: 'lch-ghost', disabled: !canCommit, onClick: () => commit(true, true) }, busy === 'Creating PR…' ? busy : 'Commit & PR') : null,
          h('span', { className: 'lch-grow' }),
          status.hasRemote && (ahead > 0 || (!upstream && status.hasHead)) ? h('button', {
            type: 'button',
            className: 'lch-ghost',
            disabled: !!busy,
            onClick: () => run('Pushing…', async () => {
              await call('push', { cwd });
              report('Pushed', 'ok');
            }),
          }, ahead > 0 ? `Push ↑${ahead}` : 'Publish branch') : null,
          status.hasRemote && files.length === 0 && status.hasHead ? h('button', {
            type: 'button',
            className: 'lch-ghost',
            disabled: !!busy,
            onClick: () => run('Creating PR…', async () => {
              const pr = await call('createPr', { cwd });
              report(h('span', null, pr.existed ? 'PR already open: ' : 'Opened PR: ', h('a', { href: pr.url, target: '_blank', rel: 'noopener' }, pr.url)), 'ok');
            }),
          }, busy === 'Creating PR…' ? busy : 'Create PR') : null));
    }

    function Panel({ cwd, sessionId, active }) {
      const [status, setStatus] = useState(null);
      const [error, setError] = useState(null);
      const [open, setOpen] = useState(() => new Set());
      const [selected, setSelected] = useState(() => new Set());
      const [revision, setRevision] = useState(0);
      const [message, setMessage] = useState(null);
      const [menu, setMenu] = useState(null);
      const knownRef = useRef(new Set());
      const sequence = useRef(0);

      const report = useCallback((text, tone) => setMessage({ text, tone, at: Date.now() }), []);
      useEffect(() => {
        if (!message || message.tone === 'error') return;
        const timer = setTimeout(() => setMessage(null), 6000);
        return () => clearTimeout(timer);
      }, [message]);

      const refresh = useCallback(async () => {
        if (!cwd) return;
        const id = ++sequence.current;
        try {
          const value = await call('status', { cwd });
          if (id !== sequence.current) return;
          setError(null);
          setStatus((previous) => {
            // Re-fetch open diffs when anything about the file list changes.
            const key = (s) => JSON.stringify((s?.files ?? []).map((f) => [f.path, f.status, f.added, f.removed]));
            if (key(previous) !== key(value)) setRevision((n) => n + 1);
            return value;
          });
          // New files start selected and, for small change sets, expanded.
          const files = value.files ?? [];
          const fresh = files.filter((file) => !knownRef.current.has(file.path));
          if (fresh.length) {
            setSelected((current) => new Set([...current, ...fresh.map((file) => file.path)]));
            if (files.length <= AUTO_EXPAND_FILES) setOpen((current) => new Set([...current, ...fresh.map((file) => file.path)]));
          }
          knownRef.current = new Set(files.map((file) => file.path));
        } catch (err) {
          if (id === sequence.current) setError(err.message);
        }
      }, [cwd]);

      useEffect(() => {
        setStatus(null);
        knownRef.current = new Set();
        setOpen(new Set());
        setSelected(new Set());
      }, [cwd]);

      useEffect(() => {
        if (!active || !cwd) return;
        refresh();
        const timer = setInterval(refresh, POLL_MS);
        const onFocus = () => refresh();
        window.addEventListener('focus', onFocus);
        return () => {
          clearInterval(timer);
          window.removeEventListener('focus', onFocus);
        };
      }, [active, cwd, refresh]);

      const changed = useCallback(() => {
        setRevision((n) => n + 1);
        refresh();
      }, [refresh]);

      if (!cwd) return h('div', { className: 'lch' }, h('div', { className: 'lch-empty' }, h('strong', null, 'No working directory'), 'This chat has no folder to show changes for.'));
      if (error && !status) return h('div', { className: 'lch' }, h('div', { className: 'lch-empty' }, h('strong', null, "Couldn't read changes"), error));
      if (!status) return h('div', { className: 'lch' }, h('div', { className: 'lch-empty' }, 'Reading changes…'));
      if (!status.repo) return h('div', { className: 'lch' }, h('div', { className: 'lch-empty' }, h('strong', null, 'Not a git repository'), cwd));

      const files = status.files ?? [];
      const totals = files.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), removed: sum.removed + (file.removed ?? 0) }), { added: 0, removed: 0 });
      const allSelected = files.length > 0 && files.every((file) => selected.has(file.path));
      const allOpen = files.length > 0 && files.every((file) => open.has(file.path));
      const branch = status.branch ?? {};
      const revertAll = async () => {
        try {
          for (const file of files) await call('revertFile', { cwd, path: file.path, oldPath: file.oldPath, untracked: file.untracked });
          report(`Reverted ${files.length} file${files.length === 1 ? '' : 's'}`, 'ok');
        } catch (err) {
          report(err.message, 'error');
        }
        changed();
      };

      return h('div', { className: 'lch' },
        h('div', { className: 'lch-top' },
          h('button', {
            type: 'button',
            className: 'lch-branch',
            title: 'Switch or create a branch, or move this chat into a worktree',
            onClick: (event) => setMenu(event.currentTarget.getBoundingClientRect()),
          }, Icon.branch(14), h('span', { className: 'lch-branch-name' }, branch.name ?? (branch.oid ? branch.oid.slice(0, 8) : 'no commits')), Icon.chevron(12)),
          branch.upstream ? h('span', { className: 'lch-ab', title: `Tracking ${branch.upstream}` }, `↑${branch.ahead} ↓${branch.behind}`) : status.hasRemote && status.hasHead ? h('span', { className: 'lch-ab' }, 'not published') : null,
          h('span', { className: 'lch-grow' }),
          h('button', { type: 'button', className: 'lch-btn', title: 'Refresh', onClick: changed }, Icon.refresh(14))),
        files.length === 0
          ? h('div', { className: 'lch-scroll' }, h('div', { className: 'lch-empty' }, h('strong', null, 'No changes'), 'The working tree matches the last commit.'))
          : h(React.Fragment, null,
            h('div', { className: 'lch-summary' },
              h('input', {
                type: 'checkbox',
                checked: allSelected,
                'aria-label': 'Select all files',
                onChange: () => setSelected(allSelected ? new Set() : new Set(files.map((file) => file.path))),
              }),
              h('span', null, `${files.length} changed file${files.length === 1 ? '' : 's'} `, h('span', { className: 'lch-add' }, `+${totals.added}`), ' ', h('span', { className: 'lch-del' }, `−${totals.removed}`)),
              h('span', { className: 'lch-grow' }),
              h('button', { type: 'button', className: 'lch-btn', title: allOpen ? 'Collapse all' : 'Expand all', onClick: () => setOpen(allOpen ? new Set() : new Set(files.map((file) => file.path))) }, Icon.expand(13)),
              h(Confirm, { label: 'Revert all', confirmLabel: 'Revert everything?', icon: Icon.revert(13), onConfirm: revertAll })),
            h('div', { className: 'lch-scroll' },
              files.map((file) => h(FileRow, {
                key: file.path,
                cwd,
                file,
                revision,
                open: open.has(file.path),
                selected: selected.has(file.path),
                onToggle: () => setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(file.path)) next.delete(file.path);
                  else next.add(file.path);
                  return next;
                }),
                onSelect: (checked) => setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(file.path);
                  else next.delete(file.path);
                  return next;
                }),
                onChanged: changed,
                report,
              })),
              status.truncated ? h('div', { className: 'lch-note' }, 'Showing the first 500 files') : null)),
        message ? h('div', { className: 'lch-msg', 'data-tone': message.tone, style: { padding: '0 10px 6px' } }, message.text) : null,
        h(CommitBox, { cwd, status, selected, onChanged: changed, report }),
        menu ? h(BranchMenu, { anchor: menu, cwd, sessionId, onClose: () => setMenu(null), onChanged: changed, report }) : null);
    }

    function Body({ sessionId, useTabInfo, useSessionList }) {
      const { tab } = useTabInfo();
      if (tab.visible) currentSession = sessionId;
      const cwd = useSessionList((state) => state.byId[sessionId]?.cwd);
      return h(Panel, { cwd, sessionId, active: tab.visible });
    }

    /** Header toggle with a count of changed files (polled lightly for the chat on screen). */
    function HeaderButton({ toggle, sessionId, useSessionList }) {
      const cwd = useSessionList((state) => state.byId[sessionId]?.cwd);
      const [count, setCount] = useState(0);
      useEffect(() => {
        if (!cwd) return;
        let cancelled = false;
        const poll = () => call('status', { cwd, sessionId }).then((value) => !cancelled && setCount(value.repo ? (value.files ?? []).length : 0)).catch(() => {});
        poll();
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') poll();
        }, BADGE_POLL_MS);
        return () => {
          cancelled = true;
          clearInterval(timer);
        };
      }, [cwd, sessionId]);
      return h(P.Tooltip, { label: count ? `Changes (${count})` : 'Changes', side: 'bottom' },
        h(P.Button, { size: 'sm', 'aria-label': 'Changes', onClick: toggle },
          h('span', { style: { position: 'relative', display: 'inline-flex' } }, Icon.diff(16), count ? h('span', { className: 'lch-badge' }, count > 99 ? '99+' : count) : null)));
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
        }, 'changes: styles');

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          title: () => 'Changes',
          guide: [{
            id: 'changes',
            order: 12,
            title: () => 'Changes',
            description: () => 'Review, revert and commit edits',
            icon: P.IconBranchOutlineRegular,
          }],
        }), 'changes: sidebar tab');

        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          inject: () => ({ hooks: { sessionList: ctx.sessions.list } }),
        }, Body));

        const toggle = (sessionId) => {
          const sidebar = ctx.sidebarRight;
          try {
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
            console.warn('[changes] toggle failed', error);
          }
        };
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'local-changes',
          order: -9,
          inject: (sessionId) => ({ sessionId, toggle: () => toggle(sessionId), hooks: { sessionList: ctx.sessions.list } }),
        }, HeaderButton));
      },
    };
  },
});
