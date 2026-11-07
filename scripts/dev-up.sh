#!/usr/bin/env bash
# Bring the VETTO web app up from a cold workspace.
#
# The sandbox drops node_modules/, .next/ and the toolchain between sessions, so
# every session starts from "nothing is installed". This script is idempotent:
# run it any time, it only does the work that is actually missing.
#
#   ./scripts/dev-up.sh          # repair what is missing, then build + start
#   ./scripts/dev-up.sh --no-start  # repair + build only (for tests or screenshots)
#
# Port: 3000 (override with PORT=). The server binds 0.0.0.0 so the preview proxy
# can reach it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The toolchain lives outside the workspace snapshot when possible: ~/.tools is a
# symlink to /tmp/vetto-tools, because a 118 MB node binary would blow the snapshot
# budget. /tmp is wiped between sessions, so every repair path below has to cope with
# a dangling symlink.
TOOLS="${VETTO_TOOLS_DIR:-$HOME/.tools}"
NODE_VERSION="22.20.0"
PNPM_VERSION="9.15.0"
PORT="${PORT:-3000}"
START=1
[ "${1:-}" = "--no-start" ] && START=0

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }

# 1. Toolchain: the repo needs Node >= 22 (see package.json engines).
log "toolchain"
if [ -L "$TOOLS" ] && [ ! -e "$TOOLS" ]; then
  echo "  $TOOLS points at a wiped directory — recreating it"
  rm -f "$TOOLS"
fi
mkdir -p "$TOOLS"
if [ ! -x "$TOOLS/bin/node" ] || ! "$TOOLS/bin/node" -v >/dev/null 2>&1; then
  # The node binary loses its exec bit whenever the workspace is restored from a
  # snapshot; chmod first, only reinstall if it is genuinely gone or broken.
  [ -f "$TOOLS/bin/node" ] && chmod +x "$TOOLS/bin/node" 2>/dev/null || true
fi
if ! "$TOOLS/bin/node" -v 2>/dev/null | grep -q "v22\."; then
  echo "  installing node $NODE_VERSION into $TOOLS"
  npm i --prefix "$TOOLS" "node@$NODE_VERSION" >/dev/null 2>&1
  chmod +x "$TOOLS"/bin/* 2>/dev/null || true
fi
if [ ! -f "$TOOLS/node_modules/pnpm/bin/pnpm.cjs" ]; then
  echo "  installing pnpm $PNPM_VERSION into $TOOLS"
  npm i --prefix "$TOOLS" "pnpm@$PNPM_VERSION" >/dev/null 2>&1
fi
# npm's `node` package drops the binary in node_modules/node/bin; make sure the
# $TOOLS/bin/node entry point exists even after a fresh install.
if [ ! -x "$TOOLS/bin/node" ]; then
  mkdir -p "$TOOLS/bin"
  NODE_BIN="$(find "$TOOLS/node_modules/node" -name node -type f 2>/dev/null | head -1)"
  if [ -n "$NODE_BIN" ]; then chmod +x "$NODE_BIN"; ln -sf "$NODE_BIN" "$TOOLS/bin/node"; fi
fi
export PATH="$TOOLS/bin:$PATH"
PNPM="node $TOOLS/node_modules/pnpm/bin/pnpm.cjs"
echo "  node $("$TOOLS/bin/node" -v) · pnpm $("$PNPM" -v)"

# 2. Dependencies.
log "dependencies"
cd "$REPO_ROOT"
if [ ! -d "$REPO_ROOT/apps/web/node_modules" ]; then
  $PNPM install --frozen-lockfile
else
  echo "  already installed"
fi

# 3. Local env for this demo box only. Never commit secrets; .env.local is git-ignored.
ENV_FILE="$REPO_ROOT/apps/web/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  log "writing apps/web/.env.local (demo defaults, no secrets)"
  cat > "$ENV_FILE" <<'ENV'
ROBINHOOD_RPC_URL_PRIMARY=https://rpc.mainnet.chain.robinhood.com
ROBINHOOD_RPC_URL_SECONDARY=https://robinhood.drpc.org
# No DATABASE_URL on this box: rate limits become process-local and say so in the log.
VETTO_ALLOW_MEMORY_LIMITS=1
# Wallet sign-in needs DATABASE_URL + RATE_LIMIT_SALT + migrations. To enable it locally:
#   echo "DATABASE_URL=postgresql://user:password@127.0.0.1:5432/vetto" >> apps/web/.env.local
#   echo "RATE_LIMIT_SALT=$(openssl rand -hex 32)"            >> apps/web/.env.local
#   pnpm db:migrate
# Allow the hosted preview to frame the app. Off for any public deployment.
VETTO_PREVIEW_EMBED=1
ENV
fi

# 4. Production build. A .next left over from `next dev` breaks `next start`
#    ("routesManifest.dataRoutes is not iterable"), so always build clean.
log "build"
rm -rf "$REPO_ROOT/apps/web/.next"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1200}" \
  $PNPM --filter @vetto/web build

if [ "$START" -eq 0 ]; then
  log "build ready (not starting the server)"
  exit 0
fi

# 5. Serve. Anything already holding the port is replaced, so this script is safe
#    to re-run when a preview looks stale.
log "serving on 0.0.0.0:$PORT"
if command -v ss >/dev/null 2>&1 && ss -lntp 2>/dev/null | grep -q ":$PORT "; then
  echo "  port $PORT is busy — stopping the old listener"
  if command -v fuser >/dev/null 2>&1; then fuser -k "$PORT/tcp" 2>/dev/null || true; fi
  sleep 2
fi
cd "$REPO_ROOT/apps/web"
NODE_OPTIONS="--max-old-space-size=700" \
  exec ./node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
