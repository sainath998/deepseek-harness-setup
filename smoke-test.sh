#!/usr/bin/env bash
# Smoke-test this setup against the installed DeepSeek Harness, without touching the real profile.
# Run it after DSH updates: it boots an isolated copy of the desktop profile (same plugins, same
# bundle order, same settings) as a web profile on a spare port, then checks that
#   - the host starts and serves the UI,
#   - no plugin failed to import or mount (the host log has no load errors).
# It does not click through the UI; for that, open the printed URL yourself.
# Usage: ./smoke-test.sh [seconds-to-wait (default 25)]
set -uo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
APP="/Applications/DeepSeek Harness.app"
DSH="$APP/Contents/Resources/runtime/cli/bin/dsh"
WAIT="${1:-25}"
PORT=47$((RANDOM % 900 + 100))
WORK="$(mktemp -d)"
export DSH_HOME="$WORK/home"
PLUGINS="$WORK/plugins"
LOG="$WORK/host.log"
trap 'kill $HOST_PID 2>/dev/null; wait $HOST_PID 2>/dev/null; rm -rf "$WORK"' EXIT

[[ -x "$DSH" ]] || { echo "FAIL: DeepSeek Harness is not installed"; exit 1; }
version="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["desktopVersion"])' "$APP/Contents/Resources/runtime/primary-runtime/runtime.json")"
echo "DeepSeek Harness $version — smoke test on port $PORT"

# Same profile as install.sh, plus the web surface so it can be served without the desktop app.
mkdir -p "$DSH_HOME/profiles/smoke" "$PLUGINS"
cp -R "$REPO"/plugins/* "$PLUGINS/"
for file in package.json cordis.patch.yml pnpm-workspace.yaml; do
  sed "s#__PLUGINS_DIR__#$PLUGINS#g" "$REPO/profile/$file" > "$DSH_HOME/profiles/smoke/$file"
done
python3 - "$DSH_HOME/profiles/smoke/package.json" <<'EOF'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
bundles = d['dsh']['profile']['bundles']
if '@deepseek-ai/dsh-web-app' not in bundles: bundles.insert(1, '@deepseek-ai/dsh-web-app')
json.dump(d, open(p, 'w'), indent=2)
EOF
if ! "$DSH" plugin --profile smoke install > "$WORK/install.log" 2>&1; then
  echo "FAIL: plugin install failed"; tail -20 "$WORK/install.log"; exit 1
fi

"$DSH" --profile smoke --no-open --port "$PORT" > "$LOG" 2>&1 < /dev/null &
HOST_PID=$!
url=""
for _ in $(seq 1 "$WAIT"); do
  url="$(grep -o 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*' "$LOG" | head -1)"
  [[ -n "$url" ]] && break
  kill -0 $HOST_PID 2>/dev/null || break
  sleep 1
done
sleep 5  # let late plugins mount and report

fail=0
if [[ -z "$url" ]]; then
  echo "FAIL: the host did not start"; fail=1
else
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$WORK/cookies" -L "$url")"
  [[ "$code" == "200" ]] && echo "ok    UI served" || { echo "FAIL: UI returned HTTP $code"; fail=1; }
fi

# A fresh home has no rea machine bundle (install.sh sets it up); the rea plugin tolerates that.
if grep -q 'plugins/rea-bundle/bin/rea-shim.mjs' "$LOG"; then
  echo "note  rea bundle not set up in the isolated home (expected; install.sh provisions it)"
fi
errors="$(grep -iE 'error|failed|cannot find|is not a function|unhandled|ERR_' "$LOG" | grep -v -e 'codesign_util' -e 'plugins/rea-bundle/bin/rea-shim.mjs' || true)"
if [[ -n "$errors" ]]; then
  echo "FAIL: errors in the host log:"; echo "$errors" | head -30; fail=1
else
  echo "ok    no plugin load errors in the host log"
fi

if [[ $fail -eq 0 ]]; then
  echo "PASS — this setup loads cleanly on DeepSeek Harness $version"
else
  cp "$LOG" "$REPO/smoke-test.last.log"
  echo "Full host log saved to $REPO/smoke-test.last.log"
fi
exit $fail
