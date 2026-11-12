# DeepSeek Harness setup (T3 Code-style)

A snapshot of my DeepSeek Harness desktop setup: the exact app version, every local plugin, the
profile (plugin list, load order, settings), and the community plugins at pinned versions.
`install.sh` rebuilds it on any Apple Silicon Mac.

## Restore

```sh
gh repo clone sainath998/deepseek-harness-setup
cd deepseek-harness-setup
./install.sh            # or ./install.sh --skip-app to keep the installed app
```

Quit DeepSeek Harness (Cmd+Q) first. Anything replaced is backed up with a `.bak-<timestamp>` suffix.

## After a DeepSeek Harness update

```sh
./smoke-test.sh
```

Boots an isolated copy of this setup (same plugins, order and settings, separate DSH home, spare port)
and reports PASS/FAIL: the host starts, the UI is served, and no plugin failed to load. Your real
profile is untouched. If it fails, `./install.sh` puts you back on the pinned 0.2.2-rc.1.

## What's pinned

| Piece | Version |
|---|---|
| DeepSeek Harness (macOS arm64) | **0.2.2-rc.1**, attached to the [`dsh-0.2.2-rc.1` release](../../releases/tag/dsh-0.2.2-rc.1) (sha256 `7878aaa7…bdc24d`); original URL in `install.sh` |
| dsh-browser-cdp | 1.9.9 |
| dsh-oh-my-claude | 1.6.1 |
| dsh-opencode-palette | 2.1.12 |
| dsh-plugin-rea | 2.0.16 |

## Local plugins (`plugins/`)

| Plugin | What it does |
|---|---|
| agent-browser | T3 Code-style browser: the (headless) Chrome the agent drives, in the right sidebar with address bar, tabs and full mouse/keyboard; collapsing the sidebar floats it over the chat (drag, resize, open in sidebar, close). Detects local dev servers (banner + "Open" cards), **annotate** (pick an element, add a note, send it to the chat), **screenshot to chat**, find in page (⌘F), zoom (⌘+ / ⌘− / ⌘0). Agents get a `sidebar_browser` tool. Replaces the built-in Browser tab. |
| changes | T3 Code-style Changes panel: the chat's git diff against HEAD, revert a file or a single hunk, commit selected files, commit & push, commit & PR, switch/create branches, and "New worktree for this chat" (enables DSH's experimental worktree service and its agent tool). Follows the chat into its worktree. |
| pull-requests | Read-only GitHub PR panel in the right sidebar (needs `gh auth login`). |
| cmd-j-terminal | Cmd+J toggles a terminal along the bottom of the window. |
| settled-section | Settle finished chats into a Settled section at the bottom of the sidebar. |
| t3-sidebar | T3 Code-like sidebar chrome. |
| sidebar-bottom-bar | Logo, Plugins, Automation tasks and More moved to the sidebar bottom. |
| workspace-labels | Workspace name above each chat title in the "In one list" view. |
| session-number-shortcuts | Cmd+1…9 open the first nine sessions. |
| sidebar-toggle-shortcuts | Cmd+Shift+E / Cmd+Shift+B toggle the left / right sidebar, with a faster slide. |
| search-jump | Opening a search result scrolls to and highlights the match. |
| delete-chat | Delete chat in the session right-click menu. |
| fast-animations | One-shot animations finish in 0.05s. |

## Layout

```
plugins/   local plugins (each is an @local/<name> package, linked from ~/.dsh-local-plugins)
profile/   ~/.dsh/profiles/desktop: package.json (deps + bundle order), cordis.patch.yml (settings),
           pnpm lock; __PLUGINS_DIR__ is replaced with ~/.dsh-local-plugins by install.sh
install.sh
smoke-test.sh
```

## Not included

API keys and sign-ins (`~/.dsh/.credentials.yaml`), chat history (`~/.dsh/sessions`), and the agent
browser's Chrome profile (`~/.local/share/ego-lite-linux`) stay on the machine on purpose.

## Updating this snapshot

Copy changed plugins from `~/.dsh-local-plugins/` into `plugins/`, copy `~/.dsh/profiles/desktop/`
files into `profile/` (re-applying the `__PLUGINS_DIR__` placeholder), commit, push.
