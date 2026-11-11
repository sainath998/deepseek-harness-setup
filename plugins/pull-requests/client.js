window.__ModuleLoader__.load({
  id: '@local/pull-requests',
  factory(require) {
    // T3 Code-style, read-only GitHub PR panel for the right sidebar. Data comes from this plugin's
    // Host route (/api/local-pull-requests), which reads GitHub through the signed-in `gh` CLI.
    const React = require('react');
    const h = React.createElement;
    const P = require('@deepseek-ai/dsh-client-ui-primitives');

    const ID = '@local/pull-requests';
    const KIND = 'local-pull-requests';
    const POLL_MS = 60_000;
    const LINKS = 'local.pull-requests.v1.';

    const CSS = `
.lpr{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px;color:var(--dsw-alias-label-primary)}
.lpr-scroll{flex:1;min-height:0;overflow-y:auto;padding:8px 8px 12px}
.lpr-muted{color:var(--dsw-alias-label-secondary)}
.lpr-faint{color:var(--dsw-alias-label-tertiary)}
.lpr-section{font-size:11px;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em;margin:14px 8px 6px}
.lpr-row{display:flex;gap:10px;align-items:flex-start;width:100%;padding:8px;border:none;border-radius:var(--dsw-radius-sm);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;position:relative}
.lpr-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lpr-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.lpr-row-title{display:flex;align-items:center;gap:6px;min-width:0}
.lpr-row-title>.lpr-title-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.lpr-num{color:var(--dsw-alias-label-secondary);flex:none}
.lpr-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);display:flex;flex-wrap:wrap;gap:0 6px;min-width:0}
.lpr-meta>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.lpr-add{color:var(--dsw-alias-code-diff-added)}
.lpr-del{color:var(--dsw-alias-code-diff-deleted)}
.lpr-row-action{opacity:0;flex:none}
.lpr-row:hover .lpr-row-action,.lpr-row:focus-within .lpr-row-action{opacity:1}
.lpr-icon{flex:none;display:inline-flex;margin-top:1px}
.lpr-dot{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.lpr-tone-success{color:var(--dsw-alias-state-success-primary)}
.lpr-tone-error{color:var(--dsw-alias-state-error-primary)}
.lpr-tone-warn{color:var(--dsw-alias-state-warn-primary)}
.lpr-tone-muted{color:var(--dsw-alias-label-tertiary)}
.lpr-tone-merged{color:var(--dsw-static-violet-600)}
.lpr-bg-success{background:var(--dsw-alias-state-success-primary)}
.lpr-bg-error{background:var(--dsw-alias-state-error-primary)}
.lpr-bg-warn{background:var(--dsw-alias-state-warn-primary)}
.lpr-bg-muted{background:var(--dsw-alias-label-tertiary)}
.lpr-footer{flex:none;border-top:.5px solid var(--dsw-alias-border-l2);padding:6px 8px;display:flex;flex-direction:column;gap:6px}
.lpr-footer-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.lpr-footer-row>.lpr-grow{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lpr-input{flex:1;min-width:0;height:26px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.lpr-input:focus{border-color:var(--dsw-alias-label-tertiary)}
.lpr-error{color:var(--dsw-alias-state-error-primary);font-size:12px;padding:0 2px}
.lpr-empty{padding:32px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}
.lpr-empty strong{display:block;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;margin-bottom:4px}
.lpr-detail-top{display:flex;align-items:center;gap:6px;padding:8px 8px 0;flex:none}
.lpr-link{border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.lpr-link:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
.lpr-pill{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:9px;font-size:11px;border:.5px solid currentColor;white-space:nowrap}
.lpr-head{padding:6px 16px 10px;display:flex;flex-direction:column;gap:6px;flex:none}
.lpr-h1{font-size:16px;font-weight:600;line-height:1.35;margin:0;word-break:break-word}
.lpr-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px}
.lpr-chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;cursor:pointer}
.lpr-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lpr-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.lpr-tabs{display:flex;align-items:center;gap:8px;padding:0 16px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}
.lpr-seg{display:inline-flex;padding:2px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l2)}
.lpr-seg button{border:none;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:22px;padding:0 10px;border-radius:var(--dsw-radius-sm);cursor:pointer}
.lpr-seg button[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.lpr-checks-btn{margin-left:auto;display:inline-flex;align-items:center;gap:6px;border:none;background:none;font:inherit;font-size:12px;cursor:pointer;padding:2px 4px;border-radius:var(--dsw-radius-sm)}
.lpr-checks-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lpr-pane{padding:12px 16px 16px;display:flex;flex-direction:column;gap:16px}
.lpr-block-title{font-size:11px;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.lpr-people{display:flex;flex-direction:column;gap:6px}
.lpr-person{display:flex;align-items:center;gap:8px;font-size:12px}
.lpr-avatar{width:18px;height:18px;border-radius:50%;flex:none;object-fit:cover;background:var(--dsw-alias-interactive-bg-hover);display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:var(--dsw-alias-label-secondary);overflow:hidden}
.lpr-labels{display:flex;flex-wrap:wrap;gap:4px}
.lpr-label{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:10px;font-size:11px;font-weight:500;border:.5px solid transparent}
.lpr-md{font-size:13px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere}
.lpr-md>:first-child{margin-top:0}.lpr-md>:last-child{margin-bottom:0}
.lpr-md p,.lpr-md ul,.lpr-md ol,.lpr-md pre,.lpr-md blockquote,.lpr-md table{margin:0 0 8px}
.lpr-md h1,.lpr-md h2,.lpr-md h3,.lpr-md h4{font-size:13px;font-weight:600;margin:12px 0 6px}
.lpr-md ul,.lpr-md ol{padding-left:20px}
.lpr-md a{color:inherit;text-decoration:underline;text-decoration-color:var(--dsw-alias-label-tertiary)}
.lpr-md code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover)}
.lpr-md pre{padding:8px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);overflow-x:auto}
.lpr-md pre code{padding:0;background:none}
.lpr-md img{max-width:100%;height:auto}
.lpr-md blockquote{padding-left:10px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.lpr-md table{border-collapse:collapse;display:block;overflow-x:auto}
.lpr-md td,.lpr-md th{border:.5px solid var(--dsw-alias-border-l2);padding:3px 6px}
.lpr-md details summary{cursor:pointer}
.lpr-checklist{display:flex;flex-direction:column}
.lpr-check{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;min-width:0}
.lpr-check-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpr-feed{position:relative;display:flex;flex-direction:column;gap:14px;padding-left:22px}
.lpr-feed:before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:1px;background:var(--dsw-alias-border-l2)}
.lpr-event{position:relative;display:flex;flex-direction:column;gap:4px;font-size:12px;min-width:0}
.lpr-event-mark{position:absolute;left:-22px;top:0;width:17px;height:17px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-base)}
.lpr-event-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary)}
.lpr-event-line strong{color:var(--dsw-alias-label-primary);font-weight:500}
.lpr-event-body{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:8px 10px;max-height:240px;overflow:auto}
.lpr-files{display:flex;flex-direction:column}
.lpr-file{display:flex;align-items:center;gap:8px;padding:5px 6px;border:none;background:none;color:inherit;font:inherit;font-size:12px;text-align:left;border-radius:var(--dsw-radius-sm);cursor:pointer;min-width:0}
.lpr-file:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lpr-file-type{width:14px;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;text-align:center}
.lpr-file-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
.lpr-file-path>bdi{direction:ltr}
.lpr-nums{flex:none;font-size:11px;display:inline-flex;gap:6px}
.lpr-spin{animation:lpr-spin 1s linear infinite}
@keyframes lpr-spin{to{transform:rotate(360deg)}}
`;

    /* ---------------------------------------------------------------- helpers */

    function ago(value, now) {
      const time = typeof value === 'number' ? value : Date.parse(value);
      if (!Number.isFinite(time)) return '';
      const seconds = Math.max(0, Math.round((now - time) / 1000));
      if (seconds < 45) return `${seconds}s ago`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.round(hours / 24);
      if (days < 30) return `${days}d ago`;
      const months = Math.round(days / 30);
      if (months < 12) return `${months}mo ago`;
      return `${Math.round(months / 12)}y ago`;
    }
    function duration(ms) {
      if (ms === null || ms === undefined || !Number.isFinite(ms)) return '';
      const seconds = Math.round(ms / 1000);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
      return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    function openLink(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    function copy(text) {
      try {
        navigator.clipboard?.writeText(text);
      } catch {}
    }

    /** Remove active content from GitHub's rendered HTML before it is shown. */
    function sanitize(html) {
      if (typeof html !== 'string' || html === '') return '';
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      doc.querySelectorAll('script,style,iframe,frame,frameset,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,template').forEach((node) => node.remove());
      for (const element of doc.body.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
          const name = attribute.name.toLowerCase();
          const value = attribute.value.trim().toLowerCase();
          if (name.startsWith('on') || name === 'style' || name === 'srcdoc' || name === 'formaction') element.removeAttribute(attribute.name);
          else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && (value.startsWith('javascript:') || value.startsWith('data:text') || value.startsWith('vbscript:'))) element.removeAttribute(attribute.name);
        }
      }
      return doc.body.innerHTML;
    }

    /** A label's chip colors from GitHub's hex: tinted background, readable text in either theme. */
    function labelStyle(hex) {
      const color = /^[0-9a-f]{6}$/i.test(hex ?? '') ? `#${hex}` : '#888888';
      return {
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        color: `color-mix(in srgb, ${color} 55%, var(--dsw-alias-label-primary))`,
      };
    }

    function readLinks(sessionId) {
      try {
        const raw = localStorage.getItem(LINKS + sessionId);
        const value = raw === null ? undefined : JSON.parse(raw);
        return {
          manual: Array.isArray(value?.manual) ? value.manual.filter((item) => typeof item === 'string') : [],
          unlinked: Array.isArray(value?.unlinked) ? value.unlinked.filter((item) => typeof item === 'string') : [],
        };
      } catch {
        return { manual: [], unlinked: [] };
      }
    }
    function writeLinks(sessionId, links) {
      try {
        localStorage.setItem(LINKS + sessionId, JSON.stringify(links));
      } catch {}
    }

    async function sha256(text) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    /* ---------------------------------------------------------------- glyphs */

    function PrGlyph({ state, isDraft, size = 16 }) {
      const tone = state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'error' : isDraft ? 'muted' : 'success';
      const label = state === 'MERGED' ? 'Merged' : state === 'CLOSED' ? 'Closed' : isDraft ? 'Draft' : 'Open';
      const stroke = { stroke: 'currentColor', strokeWidth: 1.3, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
      let paths;
      if (state === 'MERGED') {
        paths = [h('circle', { key: 1, cx: 4.5, cy: 3.5, r: 1.6, ...stroke }), h('circle', { key: 2, cx: 4.5, cy: 12.5, r: 1.6, ...stroke }), h('circle', { key: 3, cx: 11.5, cy: 8.5, r: 1.6, ...stroke }),
          h('path', { key: 4, d: 'M4.5 5.1v5.8M4.5 5.5c0 2.2 1.8 3 5.4 3', ...stroke })];
      } else if (state === 'CLOSED') {
        paths = [h('circle', { key: 1, cx: 4.5, cy: 3.5, r: 1.6, ...stroke }), h('circle', { key: 2, cx: 4.5, cy: 12.5, r: 1.6, ...stroke }), h('path', { key: 3, d: 'M4.5 5.1v5.8M10 3l3 3M13 3l-3 3M11.5 8.5v2.4', ...stroke }), h('circle', { key: 4, cx: 11.5, cy: 12.5, r: 1.6, ...stroke })];
      } else {
        paths = [h('circle', { key: 1, cx: 4.5, cy: 3.5, r: 1.6, ...stroke }), h('circle', { key: 2, cx: 4.5, cy: 12.5, r: 1.6, ...stroke }), h('circle', { key: 3, cx: 11.5, cy: 12.5, r: 1.6, ...stroke }),
          h('path', { key: 4, d: isDraft ? 'M4.5 5.1v5.8M11.5 5v1M11.5 8v1' : 'M4.5 5.1v5.8M11.5 10.9V6.5c0-1.2-.8-2-2-2H7.5M8.8 3.2 7.5 4.5l1.3 1.3', ...stroke })];
      }
      return h('span', { className: `lpr-icon lpr-tone-${tone}`, title: label, 'aria-label': label, role: 'img' },
        h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true }, paths));
    }

    function checksTone(rollup) {
      switch (rollup) {
        case 'SUCCESS': return ['success', 'Checks passed'];
        case 'FAILURE':
        case 'ERROR': return ['error', 'Checks failing'];
        case 'PENDING':
        case 'EXPECTED': return ['warn', 'Checks running'];
        default: return undefined;
      }
    }
    const BUCKET_TONE = { fail: 'error', pending: 'warn', cancel: 'muted', pass: 'success', skip: 'muted' };
    const BUCKET_LABEL = { fail: 'Failed', pending: 'Running', cancel: 'Cancelled', pass: 'Passed', skip: 'Skipped' };
    const REVIEW_LABEL = { APPROVED: ['approved', 'success'], CHANGES_REQUESTED: ['requested changes', 'error'], COMMENTED: ['commented', 'muted'], DISMISSED: ['dismissed', 'muted'], REQUESTED: ['review requested', 'warn'] };
    const CHANGE_TYPE = { ADDED: ['A', 'success'], DELETED: ['D', 'error'], RENAMED: ['R', 'warn'], COPIED: ['C', 'warn'], MODIFIED: ['M', 'muted'], CHANGED: ['M', 'muted'] };

    function Avatar({ person, size = 18 }) {
      const [failed, setFailed] = React.useState(false);
      const login = person?.login ?? '?';
      if (!person?.avatarUrl || failed) {
        return h('span', { className: 'lpr-avatar', style: { width: size, height: size }, 'aria-hidden': true }, login.slice(0, 1).toUpperCase());
      }
      const src = person.avatarUrl + (person.avatarUrl.includes('?') ? '&' : '?') + `s=${size * 2}`;
      return h('img', { className: 'lpr-avatar', style: { width: size, height: size }, src, alt: '', onError: () => setFailed(true), referrerPolicy: 'no-referrer' });
    }

    function Icon({ component, size = 14 }) {
      return h('span', { style: { display: 'inline-flex', width: size, height: size }, 'aria-hidden': true }, h(component));
    }

    /* ---------------------------------------------------------------- list */

    function PrRow({ pr, now, onOpen, action }) {
      const tone = checksTone(pr.checks);
      if (pr.missing) {
        return h('div', { className: 'lpr-row', style: { cursor: 'default' } },
          h(PrGlyph, { state: 'CLOSED' }),
          h('div', { className: 'lpr-row-main' },
            h('div', { className: 'lpr-row-title' }, h('span', { className: 'lpr-num' }, `#${pr.number}`), h('span', { className: 'lpr-title-text lpr-muted' }, 'Not found or no access')),
            h('div', { className: 'lpr-meta' }, h('span', null, pr.repo))),
          action);
      }
      return h('div', {
        className: 'lpr-row',
        role: 'button',
        tabIndex: 0,
        onClick: () => onOpen(pr.url),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(pr.url);
          }
        },
      },
      h(PrGlyph, { state: pr.state, isDraft: pr.isDraft }),
      h('div', { className: 'lpr-row-main' },
        h('div', { className: 'lpr-row-title' },
          h('span', { className: 'lpr-num' }, `#${pr.number}`),
          h('span', { className: 'lpr-title-text' }, pr.title),
          tone && h('span', { className: `lpr-dot lpr-bg-${tone[0]}`, title: tone[1], 'aria-label': tone[1], role: 'img' })),
        h('div', { className: 'lpr-meta' },
          h('span', null, h('span', { className: 'lpr-add' }, `+${pr.additions}`), ' ', h('span', { className: 'lpr-del' }, `−${pr.deletions}`)),
          h('span', null, pr.author?.login),
          h('span', null, pr.repo),
          h('span', { className: 'lpr-mono', title: `${pr.headRefName} → ${pr.baseRefName}` }, `${pr.headRefName} → ${pr.baseRefName}`),
          h('span', null, `updated ${ago(pr.updatedAt, now)}`))),
      action);
    }

    function ListView({ data, error, loading, now, onOpen, onRefresh, onLink, onUnlink, linkError, linking }) {
      const [adding, setAdding] = React.useState(false);
      const [input, setInput] = React.useState('');
      const prs = data?.prs ?? [];
      const mentioned = data?.mentioned ?? [];
      const open = prs.filter((pr) => pr.state === 'OPEN').length;
      const submit = async () => {
        if (input.trim() === '') return;
        if (await onLink(input.trim())) {
          setInput('');
          setAdding(false);
        }
      };
      const unlinkButton = (url) => h('span', { className: 'lpr-row-action' },
        h(P.Tooltip, { label: 'Unlink from this chat', side: 'left' },
          h(P.Button, { size: 'sm', variant: 'ghost', 'aria-label': 'Unlink', onClick: (event) => { event.stopPropagation(); onUnlink(url); } }, h(Icon, { component: P.IconCloseOutlineRegular }))));
      const linkButton = (url) => h(P.Button, { size: 'sm', variant: 'outline', onClick: (event) => { event.stopPropagation(); onLink(url); } }, 'Link');
      return h('div', { className: 'lpr' },
        h('div', { className: 'lpr-scroll' },
          error && h('div', { className: 'lpr-error', role: 'alert', style: { padding: '4px 8px 8px' } }, error),
          prs.length === 0 && data !== undefined && h('div', { className: 'lpr-empty' },
            h('strong', null, 'No pull requests linked'),
            'PRs this chat creates with gh pr create, the open PR for the current branch, and PRs you link appear here.'),
          data === undefined && !error && h('div', { className: 'lpr-empty' }, 'Loading pull requests…'),
          prs.map((pr) => h(PrRow, { key: pr.url, pr, now, onOpen, action: unlinkButton(pr.url) })),
          mentioned.length > 0 && h('div', { className: 'lpr-section' }, 'Mentioned in this chat'),
          mentioned.map((pr) => h(PrRow, { key: pr.url, pr, now, onOpen, action: linkButton(pr.url) }))),
        h('div', { className: 'lpr-footer' },
          adding && h('div', { className: 'lpr-footer-row' },
            h('input', {
              className: 'lpr-input',
              autoFocus: true,
              placeholder: 'PR URL or #123',
              value: input,
              onChange: (event) => setInput(event.target.value),
              onKeyDown: (event) => {
                event.stopPropagation();
                if (event.key === 'Enter') submit();
                if (event.key === 'Escape') setAdding(false);
              },
            }),
            h(P.Button, { size: 'sm', variant: 'primary', onClick: submit, disabled: linking }, linking ? 'Linking…' : 'Link')),
          adding && linkError && h('div', { className: 'lpr-error' }, linkError),
          h('div', { className: 'lpr-footer-row' },
            h('span', { className: 'lpr-grow' }, `${open} open · ${prs.length} linked · ${data ? `synced ${ago(data.syncedAt, now)}` : 'not synced'}`),
            h(P.Tooltip, { label: 'Refresh', side: 'top' },
              h(P.Button, { size: 'sm', variant: 'ghost', 'aria-label': 'Refresh', onClick: onRefresh },
                h('span', { className: loading ? 'lpr-spin' : undefined, style: { display: 'inline-flex' } }, h(Icon, { component: P.IconRefreshOutlineRegular })))),
            h(P.Button, { size: 'sm', variant: 'ghost', onClick: () => setAdding(!adding) }, adding ? 'Cancel' : '+ Link'))));
    }

    /* ---------------------------------------------------------------- detail */

    function ChecksList({ checks }) {
      if (checks.length === 0) return h('div', { className: 'lpr-faint', style: { fontSize: 12 } }, 'No checks reported.');
      return h('div', { className: 'lpr-checklist' }, checks.map((check, index) => h('div', { key: `${check.name}-${index}`, className: 'lpr-check' },
        h('span', { className: `lpr-dot lpr-bg-${BUCKET_TONE[check.bucket]}`, title: BUCKET_LABEL[check.bucket], role: 'img', 'aria-label': BUCKET_LABEL[check.bucket] }),
        h('span', { className: 'lpr-check-name', title: check.workflow ? `${check.workflow} / ${check.name}` : check.name },
          check.workflow ? h('span', { className: 'lpr-faint' }, `${check.workflow} / `) : null, check.name),
        h('span', { className: 'lpr-faint' }, duration(check.durationMs)),
        check.url && h('button', { type: 'button', className: 'lpr-link', onClick: () => openLink(check.url) }, 'Details'))));
    }

    function checksSummary(detail) {
      const checks = detail.checks;
      const failing = checks.filter((check) => check.bucket === 'fail').length;
      const pending = checks.filter((check) => check.bucket === 'pending').length;
      if (checks.length === 0) return undefined;
      if (failing > 0) return ['error', `${failing} of ${checks.length} failing`];
      if (pending > 0) return ['warn', `${pending} of ${checks.length} running`];
      return ['success', `${checks.length} checks passed`];
    }

    function Html({ html }) {
      const safe = React.useMemo(() => sanitize(html), [html]);
      return h('div', {
        className: 'lpr-md',
        dangerouslySetInnerHTML: { __html: safe },
        onClick: (event) => {
          const anchor = event.target.closest?.('a[href]');
          if (anchor === null || anchor === undefined) return;
          event.preventDefault();
          if (/^https?:/i.test(anchor.href)) openLink(anchor.href);
        },
      });
    }

    function SummaryPane({ detail }) {
      return h('div', { className: 'lpr-pane' },
        detail.reviewers.length > 0 && h('div', null,
          h('div', { className: 'lpr-block-title' }, 'Reviewers'),
          h('div', { className: 'lpr-people' }, detail.reviewers.map((person) => {
            const [label, tone] = REVIEW_LABEL[person.state] ?? [person.state.toLowerCase(), 'muted'];
            return h('div', { key: person.login, className: 'lpr-person' }, h(Avatar, { person }), h('span', null, person.login), h('span', { className: `lpr-tone-${tone}` }, label));
          }))),
        detail.labels.length > 0 && h('div', null,
          h('div', { className: 'lpr-block-title' }, 'Labels'),
          h('div', { className: 'lpr-labels' }, detail.labels.map((label) => h('span', { key: label.name, className: 'lpr-label', style: labelStyle(label.color) }, label.name)))),
        h('div', null,
          h('div', { className: 'lpr-block-title' }, 'Description'),
          detail.bodyHTML ? h(Html, { html: detail.bodyHTML }) : h('div', { className: 'lpr-faint', style: { fontSize: 12 } }, 'No description provided.')),
        h('div', null,
          h('div', { className: 'lpr-block-title' }, `Checks${detail.checksTotal > detail.checks.length ? ` (first ${detail.checks.length} of ${detail.checksTotal})` : ''}`),
          h(ChecksList, { checks: detail.checks })));
    }

    const EVENT_TEXT = {
      opened: () => 'opened this pull request',
      commit: () => 'committed',
      comment: () => 'commented',
      review: (event) => (REVIEW_LABEL[event.state]?.[0] ?? 'reviewed'),
      merged: () => 'merged this pull request',
      closed: () => 'closed this pull request',
    };
    function TimelinePane({ detail, now }) {
      return h('div', { className: 'lpr-pane' },
        detail.commitsTotal > 50 && h('div', { className: 'lpr-faint', style: { fontSize: 12 } }, `Showing the last 50 of ${detail.commitsTotal} commits.`),
        h('div', { className: 'lpr-feed' }, detail.timeline.map((event, index) => {
          const tone = event.kind === 'merged' ? 'merged' : event.kind === 'closed' ? 'error' : event.kind === 'review' ? (REVIEW_LABEL[event.state]?.[1] ?? 'muted') : 'muted';
          return h('div', { key: `${event.kind}-${event.at}-${index}`, className: 'lpr-event' },
            h('span', { className: 'lpr-event-mark' }, event.actor ? h(Avatar, { person: event.actor, size: 16 }) : h('span', { className: `lpr-dot lpr-bg-${tone === 'merged' ? 'muted' : tone}` })),
            h('div', { className: 'lpr-event-line' },
              h('strong', null, event.actor?.login ?? 'GitHub'),
              h('span', { className: event.kind === 'merged' || event.kind === 'closed' || event.kind === 'review' ? `lpr-tone-${tone}` : undefined }, EVENT_TEXT[event.kind](event)),
              event.kind === 'commit' && h('button', { type: 'button', className: 'lpr-link lpr-mono', onClick: () => event.url && openLink(event.url) }, event.sha),
              h('span', { className: 'lpr-faint' }, ago(event.at, now))),
            event.kind === 'commit' && h('div', { style: { fontSize: 12 } }, event.title),
            (event.kind === 'comment' || event.kind === 'review') && event.bodyHTML && h('div', { className: 'lpr-event-body' }, h(Html, { html: event.bodyHTML })));
        })));
    }

    function CodePane({ detail }) {
      const openFile = async (path) => {
        try {
          openLink(`${detail.url}/files#diff-${await sha256(path)}`);
        } catch {
          openLink(`${detail.url}/files`);
        }
      };
      return h('div', { className: 'lpr-pane', style: { gap: 8 } },
        detail.filesTotal > detail.files.length && h('div', { className: 'lpr-faint', style: { fontSize: 12 } }, `Showing the first ${detail.files.length} of ${detail.filesTotal} files.`),
        h('div', { className: 'lpr-files' }, detail.files.map((file) => {
          const [letter, tone] = CHANGE_TYPE[file.changeType] ?? ['M', 'muted'];
          return h('button', { key: file.path, type: 'button', className: 'lpr-file', title: `Open ${file.path} on GitHub`, onClick: () => openFile(file.path) },
            h('span', { className: `lpr-file-type lpr-tone-${tone}`, title: file.changeType.toLowerCase() }, letter),
            h('span', { className: 'lpr-file-path' }, h('bdi', null, file.path)),
            h('span', { className: 'lpr-nums' }, h('span', { className: 'lpr-add' }, `+${file.additions}`), h('span', { className: 'lpr-del' }, `−${file.deletions}`)));
        })));
    }

    function DetailView({ url, call, visible, now, onBack }) {
      const [detail, setDetail] = React.useState(undefined);
      const [error, setError] = React.useState(undefined);
      const [tab, setTab] = React.useState('summary');
      const [copied, setCopied] = React.useState(false);
      const sequence = React.useRef(0);
      const load = React.useCallback(async () => {
        const id = ++sequence.current;
        try {
          const value = await call('detail', { url });
          if (id !== sequence.current) return;
          setDetail(value);
          setError(undefined);
        } catch (failure) {
          if (id === sequence.current) setError(failure.message);
        }
      }, [url, call]);
      React.useEffect(() => {
        if (!visible) return undefined;
        load();
        const timer = setInterval(load, POLL_MS);
        window.addEventListener('focus', load);
        return () => {
          clearInterval(timer);
          window.removeEventListener('focus', load);
        };
      }, [visible, load]);

      const [, owner, repo, number] = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url) ?? [];
      const top = h('div', { className: 'lpr-detail-top' },
        h(P.Tooltip, { label: 'Back', side: 'bottom' },
          h(P.Button, { size: 'sm', variant: 'ghost', 'aria-label': 'Back to pull requests', onClick: onBack }, h(Icon, { component: P.IconChevronLeftOutlineRegular }))),
        h('button', { type: 'button', className: 'lpr-link', onClick: () => openLink(url), title: 'Open on GitHub' }, `${owner}/${repo} #${number} ↗`),
        detail?.autoMerge && h('span', { className: 'lpr-pill lpr-tone-success', title: `Auto-merge (${detail.autoMerge.toLowerCase()})` }, 'Auto-merge'));
      if (detail === undefined) {
        return h('div', { className: 'lpr' }, top, h('div', { className: error ? 'lpr-error' : 'lpr-empty', style: error ? { padding: 16 } : undefined }, error ?? 'Loading pull request…'));
      }
      const summary = checksSummary(detail);
      const checkout = `gh pr checkout ${detail.number}`;
      const tabs = [['summary', 'Summary'], ['timeline', 'Timeline'], ['code', 'Code']];
      return h('div', { className: 'lpr' },
        top,
        h('div', { className: 'lpr-head' },
          h('div', { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
            h('span', { style: { marginTop: 3 } }, h(PrGlyph, { state: detail.state, isDraft: detail.isDraft })),
            h('h2', { className: 'lpr-h1' }, detail.title)),
          h('div', { className: 'lpr-meta', style: { fontSize: 12 } }, h('span', null, `${detail.author?.login} · updated ${ago(detail.updatedAt, now)}`)),
          error && h('div', { className: 'lpr-error' }, error),
          h('div', { className: 'lpr-chips' },
            h('button', {
              type: 'button',
              className: 'lpr-chip',
              title: 'Copy checkout command',
              onClick: () => {
                copy(checkout);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              },
            }, h(Icon, { component: copied ? P.IconCheckOutlineRegular : P.IconCopyOutlineRegular, size: 12 }), checkout)),
          h('div', { className: 'lpr-meta', style: { fontSize: 12 } },
            h('span', { className: 'lpr-mono' }, `${detail.baseRefName} ← ${detail.headRefName}`),
            h('span', null, `${detail.changedFiles} files `, h('span', { className: 'lpr-add' }, `+${detail.additions}`), ' ', h('span', { className: 'lpr-del' }, `−${detail.deletions}`)))),
        h('div', { className: 'lpr-tabs' },
          h('div', { className: 'lpr-seg', role: 'tablist' }, tabs.map(([key, label]) => h('button', { key, type: 'button', role: 'tab', 'aria-selected': tab === key, onClick: () => setTab(key) }, label))),
          summary && h('button', { type: 'button', className: `lpr-checks-btn lpr-tone-${summary[0]}`, onClick: () => setTab(tab === 'checks' ? 'summary' : 'checks'), 'aria-pressed': tab === 'checks' },
            h('span', { className: `lpr-dot lpr-bg-${summary[0]}` }), summary[1])),
        h('div', { className: 'lpr-scroll', style: { padding: 0 } },
          tab === 'summary' && h(SummaryPane, { detail }),
          tab === 'timeline' && h(TimelinePane, { detail, now }),
          tab === 'code' && h(CodePane, { detail }),
          tab === 'checks' && h('div', { className: 'lpr-pane' }, h(ChecksList, { checks: detail.checks }))));
    }

    /* ---------------------------------------------------------------- tab body */

    const cache = new Map();

    function Body({ sessionId, useTabInfo, useSessionList, call }) {
      const { tab } = useTabInfo();
      const visible = tab.visible;
      const cwd = useSessionList((state) => state.byId[sessionId]?.cwd);
      const [links, setLinks] = React.useState(() => readLinks(sessionId));
      const [data, setData] = React.useState(() => cache.get(sessionId));
      const [error, setError] = React.useState(undefined);
      const [loading, setLoading] = React.useState(false);
      const [selected, setSelected] = React.useState(undefined);
      const [linkError, setLinkError] = React.useState(undefined);
      const [linking, setLinking] = React.useState(false);
      const [now, setNow] = React.useState(Date.now());
      const sequence = React.useRef(0);

      const saveLinks = (next) => {
        setLinks(next);
        writeLinks(sessionId, next);
      };

      const refresh = React.useCallback(async () => {
        const id = ++sequence.current;
        setLoading(true);
        try {
          const value = await call('list', { sessionId, cwd, manual: links.manual, unlinked: links.unlinked });
          if (id !== sequence.current) return;
          cache.set(sessionId, value);
          setData(value);
          setError(undefined);
        } catch (failure) {
          if (id === sequence.current) setError(failure.message);
        } finally {
          if (id === sequence.current) setLoading(false);
          setNow(Date.now());
        }
      }, [call, sessionId, cwd, links]);

      React.useEffect(() => {
        if (!visible || selected !== undefined) return undefined;
        refresh();
        const timer = setInterval(refresh, POLL_MS);
        window.addEventListener('focus', refresh);
        return () => {
          clearInterval(timer);
          window.removeEventListener('focus', refresh);
        };
      }, [visible, selected, refresh]);

      React.useEffect(() => {
        if (!visible) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(timer);
      }, [visible]);

      const onLink = async (input) => {
        setLinking(true);
        setLinkError(undefined);
        try {
          const { url } = await call('resolveLink', { input, cwd });
          saveLinks({
            manual: links.manual.includes(url) ? links.manual : [...links.manual, url],
            unlinked: links.unlinked.filter((item) => item !== url),
          });
          return true;
        } catch (failure) {
          setLinkError(failure.message);
          return false;
        } finally {
          setLinking(false);
        }
      };
      const onUnlink = (url) => {
        saveLinks({
          manual: links.manual.filter((item) => item !== url),
          unlinked: links.unlinked.includes(url) ? links.unlinked : [...links.unlinked, url],
        });
        if (data !== undefined) {
          const next = { ...data, prs: data.prs.filter((pr) => pr.url !== url) };
          cache.set(sessionId, next);
          setData(next);
        }
      };

      if (selected !== undefined) {
        return h(DetailView, { key: selected, url: selected, call, visible, now, onBack: () => setSelected(undefined) });
      }
      return h(ListView, { data, error, loading, now, onOpen: setSelected, onRefresh: refresh, onLink, onUnlink, linkError, linking });
    }

    function HeaderButton({ toggle }) {
      return h(P.Tooltip, { label: 'Pull requests', side: 'bottom' },
        h(P.Button, { size: 'sm', 'aria-label': 'Pull requests', onClick: toggle }, h(Icon, { component: P.IconBranchOutlineRegular, size: 16 })));
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight', 'sessions', 'connection'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = ID;
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        }, 'pull-requests: styles');

        const call = async (method, payload) => {
          const result = await ctx.connection.rpc.call('/api', 'local-pull-requests', { method, payload });
          if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
          return result.value;
        };

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          title: () => 'Pull requests',
          guide: [{
            id: 'prs',
            order: 14,
            title: () => 'Pull requests',
            description: () => 'GitHub PRs of this chat',
            icon: P.IconBranchOutlineRegular,
          }],
        }), 'pull-requests: sidebar tab');

        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          inject: () => ({ call, hooks: { sessionList: ctx.sessions.list } }),
        }, Body));

        /** Show the panel, or hide it when it is already on screen; reuses an open tab instead of adding another. */
        const toggle = (sessionId) => {
          const sidebar = ctx.sidebarRight;
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
        };

        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'local-pull-requests',
          order: -7,
          inject: (sessionId) => ({ toggle: () => toggle(sessionId) }),
        }, HeaderButton));
      },
    };
  },
});
