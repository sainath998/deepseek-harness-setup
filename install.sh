#!/usr/bin/env bash
# Rebuild this exact DeepSeek Harness setup on a Mac (Apple Silicon):
#   1. DeepSeek Harness 0.2.2-rc.1 (skipped if that version is already installed)
#   2. the local plugins          -> ~/.dsh-local-plugins/
#   3. the desktop profile        -> ~/.dsh/profiles/desktop/ (plugin list, bundle order, settings)
#   4. pinned community plugins   (dsh-browser-cdp, dsh-oh-my-claude, dsh-opencode-palette, dsh-plugin-rea)
# Existing files are backed up next to the originals with a timestamp suffix, never deleted.
#
# Usage: ./install.sh [--skip-app]
set -euo pipefail

APP_VERSION="0.2.2-rc.1"
APP_ZIP="deepseek-harness-${APP_VERSION}-mac-arm64.zip"
APP_SHA256="7878aaa7e8a82c95b8e92a9dd27df1263d644fa0783438692b236e7477bdc24d"
APP_URL_DEEPSEEK="https://download.deepseek.com/dsh-desk/bin/mac-arm64/${APP_ZIP}"
APP_URL_RELEASE="https://github.com/sainath998/deepseek-harness-setup/releases/download/dsh-${APP_VERSION}/${APP_ZIP}"
APP="/Applications/DeepSeek Harness.app"
DSH="$APP/Contents/Resources/runtime/cli/bin/dsh"

REPO="$(cd "$(dirname "$0")" && pwd)"
PLUGINS_DIR="${DSH_PLUGINS_DIR:-$HOME/.dsh-local-plugins}"
PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/desktop"
STAMP="$(date +%Y%m%d-%H%M%S)"
SKIP_APP=0
[[ "${1:-}" == "--skip-app" ]] && SKIP_APP=1

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] || die "This setup is for macOS on Apple Silicon."

# A custom DSH_HOME (e.g. a test home) is not the running app's profile.
if [[ -z "${DSH_HOME:-}" ]] && pgrep -xq "DeepSeek Harness"; then
  die "DeepSeek Harness is running. Quit it completely (Cmd+Q) and run this again."
fi

installed_version() {
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["desktopVersion"])' \
    "$APP/Contents/Resources/runtime/primary-runtime/runtime.json" 2>/dev/null || true
}

# ------------------------------------------------------------------ 1. the app
if [[ $SKIP_APP -eq 0 ]]; then
  current="$(installed_version)"
  if [[ "$current" == "$APP_VERSION" ]]; then
    say "DeepSeek Harness $APP_VERSION is already installed"
  else
    say "Installing DeepSeek Harness $APP_VERSION (found: ${current:-none})"
    tmp="$(mktemp -d)"
    zip="$tmp/$APP_ZIP"
    if ! curl -fL --progress-bar -o "$zip" "$APP_URL_RELEASE"; then
      echo "GitHub release download failed (private repo?); trying DeepSeek's server."
      if command -v gh >/dev/null && gh release download "dsh-$APP_VERSION" -R sainath998/deepseek-harness-setup -p "$APP_ZIP" -D "$tmp" --clobber; then :
      else curl -fL --progress-bar -o "$zip" "$APP_URL_DEEPSEEK" || die "Could not download $APP_ZIP"; fi
    fi
    echo "$APP_SHA256  $zip" | shasum -a 256 -c - || die "Checksum mismatch for $APP_ZIP"
    if [[ -d "$APP" ]]; then mv "$APP" "$APP.bak-$STAMP"; echo "Previous app moved to: $APP.bak-$STAMP"; fi
    ditto -x -k "$zip" /Applications
    xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
    rm -rf "$tmp"
    [[ "$(installed_version)" == "$APP_VERSION" ]] || die "App install did not produce $APP_VERSION"
  fi
fi
[[ -x "$DSH" ]] || die "dsh CLI not found at $DSH (is DeepSeek Harness installed?)"

# ------------------------------------------------------------- 2. local plugins
say "Installing local plugins into $PLUGINS_DIR"
if [[ -d "$PLUGINS_DIR" ]]; then
  cp -R "$PLUGINS_DIR" "$PLUGINS_DIR.bak-$STAMP"
  echo "Previous plugins backed up to: $PLUGINS_DIR.bak-$STAMP"
fi
mkdir -p "$PLUGINS_DIR"
for plugin in "$REPO"/plugins/*/; do
  name="$(basename "$plugin")"
  rm -rf "${PLUGINS_DIR:?}/$name"
  cp -R "$plugin" "$PLUGINS_DIR/$name"
  echo "  $name"
done

# ------------------------------------------------------------ 3. desktop profile
say "Writing the desktop profile in $PROFILE_DIR"
mkdir -p "$PROFILE_DIR"
for file in package.json cordis.patch.yml pnpm-lock.yaml pnpm-workspace.yaml; do
  [[ -f "$PROFILE_DIR/$file" ]] && cp "$PROFILE_DIR/$file" "$PROFILE_DIR/$file.bak-$STAMP"
  sed "s#__PLUGINS_DIR__#$PLUGINS_DIR#g" "$REPO/profile/$file" > "$PROFILE_DIR/$file"
done

# -------------------------------------------------- 4. install pinned packages
say "Installing community plugins and linking local ones"
"$DSH" plugin --profile desktop install

say "Done"
cat <<EOF
Open DeepSeek Harness. Everything from this setup loads on launch:
  - T3-style sidebar, settled section, workspace labels, delete chat, search jump, fast animations
  - keyboard shortcuts (Cmd+1..9 sessions, Cmd+Shift+E / Cmd+Shift+B sidebars, Cmd+J bottom terminal)
  - Pull requests panel (needs the GitHub CLI: brew install gh && gh auth login)
  - Agent browser in the right sidebar + floating preview (uses Google Chrome, headless)
Backups of anything replaced end in .bak-$STAMP
EOF
