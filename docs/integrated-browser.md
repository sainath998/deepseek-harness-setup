# Integrated browser for DeepSeek Harness (T3 Code-style)

Everything needed to set up, understand, debug and extend the browser that lives in DeepSeek
Harness's right sidebar. Written so a person *or an agent* on another Mac can pick it up cold.

- Code: `plugins/agent-browser/` in this repo (installed to `~/.dsh-local-plugins/agent-browser`)
- Depends on: community plugin **`dsh-browser-cdp@1.9.9`** (the agent's Chrome + `bcdp_*` tools)
- Built and tested on: DeepSeek Harness **0.2.2-rc.1**, macOS arm64 (M1 Pro), Google Chrome, Node 24 (DSH's)

---

## 1. What it does

| Feature | Behaviour |
|---|---|
| Sidebar browser | Right-sidebar tab **Browser**: back / forward / reload-stop, URL bar (searches Google when it isn't a URL), tab strip when >1 tab, ⋯ menu, live page you can click, scroll and type into (IME, paste, ⌘A/C/X/Z). The page resizes to the panel ("Fit page to panel"). |
| Shared with the agent | It is the *same Chrome* the agent drives (`bcdp_*` tools, ego CLI). Agent-opened tabs and agent navigations are followed automatically. |
| Floating preview | Collapse the sidebar while the browser tab is showing → a mini player floats over the chat (top-right). Drag by the pill, resize from edges/corners (aspect locked), size/position remembered. Hover pill: **Open in sidebar**, **Close floating preview** (hides the preview only; Chrome keeps running). Also appears when the agent starts browsing while nothing shows the browser. Hidden on non-chat pages (Plugins…). |
| Pop out | Toolbar button: float now and collapse the sidebar. |
| Local dev servers | Detects HTTP servers listening on localhost (`lsof`), banner "Dev server started on localhost:5173 · Open", servers menu, cards on the empty page. |
| Annotate | Arrow button → hover highlights elements (DevTools overlay, in the stream) → click → note popover → **Add to chat** puts tag, text, CSS selector, attributes, a cropped PNG path and the note into the chat input. |
| Screenshot to chat | Camera button: saves the visible page as PNG and adds the path to the chat input. |
| Find / zoom | ⌘F find bar with match count; ⌘+ / ⌘− / ⌘0 zoom with a % badge. Shortcuts work while the page has focus. |
| Agent tool | `sidebar_browser` (actions `show`, `float`, `hide`, `open` {url, new_tab}, `status`). |
| Replaces | DSH's built-in sandboxed iframe Browser tab (disabled by this plugin's patch). |

No second Chrome window or Dock icon: the agent's Chrome runs **headless**.

---

## 2. Install on another Mac

Easiest: the whole setup.

```sh
gh repo clone sainath998/deepseek-harness-setup && cd deepseek-harness-setup
./install.sh            # quit DeepSeek Harness (Cmd+Q) first
```

Browser only (DSH already installed):

```sh
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
cp -R plugins/agent-browser ~/.dsh-local-plugins/agent-browser
"$DSH" plugin --profile desktop add dsh-browser-cdp@1.9.9
"$DSH" plugin --profile desktop add link:$HOME/.dsh-local-plugins/agent-browser
# fully quit DeepSeek Harness (Cmd+Q) and reopen — a window reload is NOT enough (see §7)
```

Requirements: Google Chrome in /Applications (or Chromium/Edge/Brave — the ego runtime auto-detects;
override with `EGO_LINUX_CHROME`). `lsof` (built into macOS) for dev-server detection.

Bundle order matters: `@local/agent-browser` must come **after** `dsh-browser-cdp` in
`~/.dsh/profiles/desktop/package.json → dsh.profile.bundles` (the `dsh plugin add` order does this),
because its patch overrides dsh-browser-cdp's config.

After restart: right sidebar → **+** → **Browser**. If no Chrome is running yet, click **Start**.

---

## 3. Architecture

T3 Code has two browser modes: on desktop an Electron `<webview>` driven over CDP from the main
process; on web/mobile a **server-side Chromium streamed over CDP screencast** with input relayed
back. DSH plugins cannot touch Electron's main process (and DSH's own webview lease API exposes no
CDP), so this is T3's **server-browser mode**:

```
 DSH window (renderer)                     DSH Host (Node 24)                    Agent Chrome (headless)
 ───────────────────────                   ──────────────────                    ───────────────────────
 client.js                                 index.js  ── routes ──┐               profile:
  ├ sidebar tab  "Browser"   ◄── NDJSON ── /events  (state)      │                ~/.local/share/ego-lite-linux/profile
  ├ floating player (overlay)◄── NDJSON ── /frames  (JPEG frames)│  hub.js        port: ~/.local/state/
  ├ header globe button      ── POST ───► /input   (mouse/keys)  ├─► CDP WS ──►    ego-lite-linux/browser.json
  └ betterSidebar shim       ── POST ───► /command (nav, tabs…)  │  servers.js
                                          GET  /capture (PNG)     │  (lsof)        ▲
                                          tool: sidebar_browser ──┘                │ same Chrome
                                                                                   │
 Agents: bcdp_* tools (dsh-browser-cdp) / ego CLI / sidebar_browser ───────────────┘
```

- **One CDP connection** (`hub.js`) to the browser-level DevTools WebSocket, shared by all viewers.
- **Screencast**: `Page.startScreencast` (JPEG q80) on a flattened session attached to the viewed
  tab; frames fanned out to every open view; slow readers get only the newest frame.
- **Input**: client batches pointer/wheel/key/text per animation frame → `POST /input` → replayed
  in order with `Input.dispatchMouseEvent` / `dispatchKeyEvent` / `insertText`.
- **Viewport**: "fill" = `Emulation.setDeviceMetricsOverride` to the panel size on *our* CDP session
  (doesn't move or resize any window; cleared when we detach). Zoom = smaller CSS viewport with
  `deviceScaleFactor = zoom`, so frames stay pixel-sharp.
- **Follow the agent**: any new tab or navigation not within 2 s of the viewer's own input is treated
  as agent activity → the view switches to it and an `activity` event may float the preview.

---

## 4. Files

### `plugins/agent-browser/`

| File | Side | Role |
|---|---|---|
| `package.json` | — | `@local/agent-browser` 2.1.0. `peerDependencies: { "@deepseek-ai/dsh-tools" }` + `engines.dsh` (see §7 — needed to import DSH packages from a linked folder). `dsh.client.inject`: sidebar-right, conversation, locale. |
| `cordis.patch.yml` | — | Inserts the row; **disables** `ui-sidebar-browser` (built-in Browser); sets `dsh-browser-cdp` config `{ toolInjection: always, localHeadless: true }`. |
| `index.js` | Host | Creates the hub, registers authenticated Fetch routes under `/api/local-agent-browser/` and the `sidebar_browser` tool. |
| `hub.js` | Host | Pure Node CDP client (`BrowserHub`): endpoint discovery, tabs, follow-agent, session attach/detach with grace periods, screencast, input replay, commands (navigate/back/forward/reload/stop/newTab/closeTab/activate/resize/setFill/zoom/dialog/capture/inspect/pick/pickEnd/find/findEnd/servers/start). Runs outside DSH too (used by tests). |
| `servers.js` | Host | `discoverServers()`: `lsof -nP -iTCP -sTCP:LISTEN -F pcn`, drops ports < 1024, system/desktop apps (regex list), DSH's own port and Chrome's debug port, probes `http://127.0.0.1:<port>/` (800 ms) and reads `<title>`. |
| `client.js` | Window | All UI (React via `require('react')`, no JSX, `window.__ModuleLoader__.load`). Store, transport, Surface (canvas + hidden textarea), toolbar, tab strip, menus, find bar, server banner, note popover, floating player, header button. |

### Routes (all owner-authenticated via `ctx.connection.fetch.register`)

| Route | Method | Body / response |
|---|---|---|
| `/api/local-agent-browser/events` | GET | NDJSON stream: `{t:'state', connected, launching, error, tabs[], activeId, nav{url,title,canGoBack,canGoForward,loading}, dialog, fill, zoom, servers[]}`, `{t:'activity', by:'agent', kind:'open'|'navigate', targetId, url}`, `{t:'reveal', mode:'sidebar'|'float'|'hide'|'auto'}`, `{t:'server', server}`, `{t:'ping'}` every 15 s |
| `/api/local-agent-browser/frames` | GET | NDJSON stream: `{t:'frame', targetId, data:<base64 jpeg>, width, height}` (CSS px), latest-only backpressure |
| `/api/local-agent-browser/input` | POST | `{events:[{type:'mouse', action:'move'|'down'|'up', x, y, button, buttons, clickCount, modifiers} | {type:'wheel', x, y, deltaX, deltaY, modifiers} | {type:'key', action:'down'|'up', key, code, keyCode, text?, modifiers} | {type:'text', text}]}` → `{ok:true}` |
| `/api/local-agent-browser/command` | POST | `{op, args}` → `{ok, value}` / `{ok:false, error}` |
| `/api/local-agent-browser/capture?path=` | GET | PNG thumbnail; only files inside the captures folder |

Modifiers bitmask: Alt 1, Ctrl 2, Meta 4, Shift 8. Coordinates are page CSS pixels.

### State on disk

| Path | What |
|---|---|
| `~/.local/state/ego-lite-linux/browser.json` | Agent Chrome's `port`, `wsUrl`, `pid`, `headless`, `profileDir` (written by dsh-browser-cdp's ego runtime) |
| `~/.local/share/ego-lite-linux/profile/` | Agent Chrome's user-data dir (logins live here; **not** your normal Chrome profile) |
| `~/.local/state/ego-lite-linux/task-spaces.json` | ego "task spaces" (agent tab groups) |
| `~/.dsh/agent-browser-captures/` | Screenshots / annotation crops sent to chat |
| `localStorage['local.agent-browser.float.v1']` | Floating player x / y / width |

---

## 5. DSH plugin APIs used (0.2.2-rc.1)

**Host**
- `ctx.connection.fetch.register({ path:'/api/…', methods, requestBody:'buffered', fetch:(Request)=>Response })` — exact routes, owner-only, work in both web and desktop. Streaming `Response(ReadableStream)` passes through (desktop forwards `dsh-app://app/api/*` to the Host with the session cookie). Send `cache-control: no-transform` so the web carrier doesn't gzip-buffer streams.
- `ctx.plugin({ inject:['tools'], apply })` + `defineTool` from `@deepseek-ai/dsh-tools` → `sub.tools.register(tool)`.
- `ctx.get('webServer')?.port` (excluded from dev-server scan), `ctx.get('profileContext')?.name`.

**Client**
- `ctx.sidebarRightTabs.register({ id, kind, title, keepMounted:true, guide:[{ id, order, title, description, icon }] })`
- `ctx.slots.register({ name:'sidebar.right.pane.tab', key:id, inject }, Body)` — body gets `{ sessionId, useTabInfo }`. `useTabInfo()` → `{ sidebar:{expanded}, tab:{id, visible, signal, …} }`. **This is how "sidebar closed" is detected**: with `keepMounted` the body stays mounted, `sidebar.expanded` flips to false while `tab.visible` drops; a closed tab aborts `tab.signal` (checked after 80 ms to tell close from collapse).
- `ctx.sidebarRight.openTab(kind) / hide(tabId) / tabsIn(sessionId) / isExpanded() / toggleExpanded() / focus(tabId) / active() / mounted.getSnapshot()` (on-screen Session).
- `ctx.slots.register({ name:'shell.overlay', id }, Overlay)` — root overlay covering the frame; hosts the floating player and the event link.
- `ctx.slots.register({ name:'conversation.session.header.utilities', id, order, inject:(sessionId)=>… }, HeaderButton)`.
- `ctx.get('layout')?.panelInfo` — `activePanelId == null` means the Conversation is shown.
- Chat input: `ctx.get('conversation').input.for(ctx.sessions.scope(sessionId))` → `setDraft(text)`, `draft`.
- `ctx.reflect.provide('betterSidebar', { registerTab, openTab })` — see §6.
- Theme tokens: `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1..4`, `--dsw-alias-label-primary|secondary|tertiary`, `--dsw-alias-border-l2..l4`, `--dsw-alias-interactive-bg-hover|active`, `--dsw-alias-brand-primary`, `--dsw-alias-button-primary-fill`, `--dsw-alias-state-success|error|warn-primary`. `--dsw-alias-code-diff-added|deleted` are 12%-alpha **backgrounds**, not text colours.

---

## 6. How it fits with dsh-browser-cdp

- dsh-browser-cdp provides the Chrome (its vendored "ego" runtime launches system Chrome with a
  separate profile and `--remote-debugging-port`), 34 `bcdp_*` agent tools, and its own live view.
- Its client mounts that live view through a `betterSidebar` service (from the community plugin
  `dsh-better-sidebar`) or else shows a floating globe button. We **provide a no-op `betterSidebar`**
  so neither appears; its `openTab()` call (fired when an agent uses a `bcdp_*` tool) becomes our
  "agent activity → reveal" signal.
- Config set by our patch: `toolInjection: always` (otherwise only `bcdp_status` is registered until
  first use — those lazily-unsealed tools never reached Claude Code over DSH's MCP bridge) and
  `localHeadless: true`.
- Our "Start" button launches Chrome through the same runtime:
  `EGO_LINUX_HEADLESS=1 node <profile>/node_modules/dsh-browser-cdp/runtime/ego-linux/bin/ego-browser.mjs`
  with a script that opens task space `"sidebar"`.

Driving the browser from a terminal (useful for agents without DSH tools, e.g. Claude Code when its
DSH MCP link is down):

```sh
EGO_LINUX_HEADLESS=1 node ~/.dsh/profiles/desktop/node_modules/dsh-browser-cdp/runtime/ego-linux/bin/ego-browser.mjs <<'EOF'
const task = await taskSpaces.useOrCreate("claude");   // required before page.*
await page.goto("https://example.com", { wait: true });
console.log(await page.evaluate(() => document.title));
await page.screenshot({ path: "/tmp/shot.png" });
EOF
```
`page`, `browser`, `taskSpaces` are predeclared globals. Use `page.mouse.click(x, y)`,
`page.keyboard.type/press` (there is no `page.click`). `page.mouse.wheel` dispatches at the origin —
use raw CDP `Input.dispatchMouseEvent` for positioned wheels.

---

## 7. Gotchas (all hit during implementation)

1. **Restart fully after changing Host code.** Client bundles are served `no-store`, so a window
   reload picks up new `client.js`, but `index.js`/`hub.js` only reload when the Host restarts
   (Cmd+Q, reopen). Symptom of a mismatch: the panel says "Reconnecting to DSH…" forever.
2. **Linked plugins and `@deepseek-ai/*` imports.** A `link:` plugin can import DSH packages only if
   its `package.json` lists them under `peerDependencies` (DSH's resolver checks that); add
   `engines.dsh` so the peer range isn't used for compatibility. Otherwise: `ERR_MODULE_NOT_FOUND`.
3. **Patch `config` replaces, never merges.** An id-targeted patch replaces the target row's whole
   config. Safe here because dsh-browser-cdp's row has no config; if you set other dsh-browser-cdp
   options in its settings page they live in the profile layer (applied after bundles).
4. **Headed Chrome hides background tabs.** Only the front tab of each window renders; screencast
   stops and CDP input **hangs** on a hidden tab. Fixes in hub.js: `Page.bringToFront` when the
   viewed tab reports `document.visibilityState === 'hidden'` (on attach, every 2 s while viewed, and
   after an input timeout); new tabs use `Target.createTarget({ newWindow: true })`; input calls use a
   2.5 s timeout. Headless mode avoids most of this.
5. **Cross-process navigation ends the screencast silently.** Restart `Page.startScreencast` on every
   main-frame `Page.frameNavigated`, then seed one `Page.captureScreenshot` if no frame arrives.
6. **Headless on macOS is fast** (GPU/Metal, ~21 fps while scrolling, measured on M1 Pro). The
   ego runtime's "headless ≈ 1 fps" warning is about Linux/Xvfb only.
7. **The DSH web UI can't be the viewed tab.** If you test by opening DSH's web UI inside the agent
   Chrome, the hub may view that same tab and resize it to the panel (hall of mirrors). Test in a
   separate Chrome (see §8).
8. **Template-literal escapes.** `DESCRIBE_ELEMENT` in hub.js is page JS inside a JS template string;
   regex escapes must be doubled (`/\\s+/`), or every "s" gets stripped from picked text.
9. **Clipboard.** Chrome is local, so ⌘C/⌘X/⌘A/⌘Z are sent as key events with CDP `commands`
   (Chrome uses the system clipboard). Paste is taken from the window's paste event and sent as
   `Input.insertText` (more reliable than the `paste` command).
10. **`dsh --dump-config` refuses the desktop profile** (app-managed); use a test profile.

---

## 8. Testing without touching your real setup

```sh
export DSH_HOME=/tmp/dsh-test            # isolated home
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile abtest add link:$HOME/.dsh-local-plugins/agent-browser
# edit $DSH_HOME/profiles/abtest/package.json → bundles:
#   ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@local/agent-browser"]
"$DSH" --profile abtest --no-open --port 47321     # prints http://127.0.0.1:47321/?token=…
```

Open that URL in a **throwaway** headless Chrome (not the agent Chrome — gotcha 7):

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=47999 --user-data-dir=/tmp/hl --window-size=1280,860 \
  '--remote-allow-origins=*' about:blank &
```
…and drive it over CDP (`Input.dispatchMouseEvent`, `Page.captureScreenshot`). Native folder pickers
don't work there; to give a test chat a git repo, edit `$DSH_HOME/storages/workspace.json` → the
workspace `path`, with the test host stopped.

The hub also runs standalone, which is the fastest way to test Host logic:

```js
import { BrowserHub } from '~/.dsh-local-plugins/agent-browser/hub.js';
const hub = new BrowserHub();
hub.addEventListener((e) => e.t === 'state' && console.log(e.nav));
hub.addFrameViewer((f) => console.log('frame', f.width, f.height));
await hub.command('navigate', { url: 'example.com' });
```

After DSH updates run `./smoke-test.sh` (repo root) — isolated boot + host-log check.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Reconnecting to DSH…" forever | Host still runs old code → Cmd+Q and reopen (gotcha 1). Check `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<dsh-port>/api/local-agent-browser/events` → 401 means the route exists (unauthenticated), 404 means the plugin's Host half isn't loaded. |
| "The browser isn't running" | No agent Chrome. Click Start, or any `bcdp_*` tool launches it. Check `~/.local/state/ego-lite-linux/browser.json` and `curl http://127.0.0.1:<port>/json/version`. |
| A second Chrome window / Dock icon | Chrome was launched headed before the patch applied. Close it gracefully (CDP `Browser.close` on the `wsUrl` in browser.json — check `pid`/`profileDir` first so you don't close your own Chrome), then relaunch with `EGO_LINUX_HEADLESS=1` as in §6. |
| Frozen picture after navigating | Screencast not restarted (gotcha 5) — make sure you run hub.js ≥ 2.0 with `restartScreencast`. |
| Clicks/typing do nothing | Viewed tab hidden (gotcha 4) or a JS dialog is open (the panel shows a dialog banner). |
| Pages look mobile-sized | "Fit page to panel" sizes the page to the sidebar width; untick it in ⋯ for desktop layout. Agents see the same layout while you view. |
| Dev server not detected | Process name matches the ignore list in servers.js, binds a non-loopback address only, or doesn't answer HTTP within 800 ms. |
| Annotate/screenshot "No chat is open" | The chat input is resolved from the on-screen Session; open a chat first. |

---

## 10. Extending

- New toolbar action: add a command case in `hub.js → command()`, call it from `client.js` with
  `command(op, args)` / `fire(op, args)`.
- New streamed state: add a field in `hub.snapshot()` and call `this.publish()` when it changes;
  read it with `useStore((s) => s.browser.<field>)`.
- Agent-facing features: extend the `sidebar_browser` tool in `index.js` (it can `hub.command(...)`
  and `hub.emit({ t:'reveal', … })`).
- Ideas not done yet: devtools/console panel (`Runtime.consoleAPICalled`), network log, device
  emulation presets, per-tab favicons, recording (T3 records with screencast + ffmpeg).
