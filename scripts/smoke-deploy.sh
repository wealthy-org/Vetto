#!/usr/bin/env bash
# Smoke-test a deployed VETTO (or a local server) end to end with curl.
#
#   scripts/smoke-deploy.sh https://your-domain
#   scripts/smoke-deploy.sh http://127.0.0.1:3000
#
# It checks exactly the things that broke on the first Vercel deploy:
#   * the app answers at all                       (GET / , /api/capabilities)
#   * the same-origin guard accepts the real site  (POST with the site's Origin)
#   * the guard still refuses a foreign origin     (POST with https://evil.example)
#   * APP_ORIGIN is the public origin, not local   (SIWE "URI:" line in the challenge)
#
# Exit code 0 = all checks passed, 1 = at least one failed.
# No secrets are needed; nothing is signed or submitted.

set -uo pipefail

ORIGIN="${1:-}"
if [ -z "$ORIGIN" ]; then
  echo "usage: $0 https://your-domain" >&2
  exit 2
fi
ORIGIN="${ORIGIN%/}"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

pass=0
fail=0

say() { printf '%s\n' "$*"; }
ok() { pass=$((pass + 1)); say "  PASS  $1"; }
no() { fail=$((fail + 1)); say "  FAIL  $1"; [ -n "${2:-}" ] && say "        $2"; }

# code <curl args...> -> prints HTTP status, leaves body in $BODY_FILE
code() { curl -sS -m 25 -o "$BODY_FILE" -w '%{http_code}' "$@"; }
body() { cat "$BODY_FILE"; }
# jget 'd["intent"]["kind"]' -> evaluates a python expression over the JSON body
jget() {
  python3 - "$1" <<'PY' "$BODY_FILE" 2>/dev/null || true
import json, sys
expr, path = sys.argv[1], sys.argv[2]
try:
    d = json.load(open(path))
except Exception:
    sys.exit(0)
try:
    print(eval(expr, {"d": d}))  # noqa: S307 - test helper, local JSON only
except Exception:
    pass
PY
}

say "VETTO smoke test → $ORIGIN"
say ""

# ---------------------------------------------------------------- public pages
say "Public pages"
for path in / /sign-in /docs; do
  status=$(code "$ORIGIN$path")
  [ "$status" = "200" ] && ok "GET $path → 200" || no "GET $path → $status"
done

# ------------------------------------------------------------------ read-only API
say ""
say "Read-only API"
status=$(code "$ORIGIN/api/capabilities")
if [ "$status" = "200" ]; then
  entries=$(jget 'len(d["capabilities"]) if isinstance(d.get("capabilities"), list) else len(d)')
  ok "GET /api/capabilities → 200 ($entries entries)"
else
  no "GET /api/capabilities → $status" "$(body | head -c 200)"
fi

# ----------------------------------------------- state-changing API: real origin
say ""
say "Same-origin guard (real site)"
status=$(code -X POST "$ORIGIN/api/intent" \
  -H 'content-type: application/json' \
  -H "origin: $ORIGIN" \
  -d '{"text":"swap 0.01 ETH to USDG"}')
if [ "$status" = "200" ]; then
  kind=$(jget 'd["intent"]["kind"]')
  ok "POST /api/intent (Origin: $ORIGIN) → 200, parsed kind=$kind"
else
  hint=$(jget 'd.get("hint") or d.get("error")')
  no "POST /api/intent (Origin: $ORIGIN) → $status" "$hint"
  say "        → APP_ORIGIN in the hosting dashboard probably does not match $ORIGIN,"
  say "          or the deployment has not been redeployed since it was changed."
fi

# ------------------------------------------- state-changing API: foreign origin
say ""
say "Same-origin guard (foreign site is refused)"
status=$(code -X POST "$ORIGIN/api/intent" \
  -H 'content-type: application/json' \
  -H 'origin: https://evil.example' \
  -d '{"text":"swap 0.01 ETH to USDG"}')
if [ "$status" = "403" ]; then
  ok "POST /api/intent (Origin: https://evil.example) → 403"
else
  no "POST /api/intent (Origin: https://evil.example) → $status" \
     "expected 403; if this is 200 the guard is bypassed (VETTO_PREVIEW_EMBED must not be set in production)."
fi

# --------------------------------------------------------- wallet sign-in challenge
say ""
say "Wallet sign-in challenge"
status=$(code -X POST "$ORIGIN/api/auth/challenge" \
  -H 'content-type: application/json' \
  -H "origin: $ORIGIN" \
  -d '{"address":"0x00c2da0000000000000000000000000000000000","chainId":4663}')
if [ "$status" = "200" ]; then
  uri=$(jget 'next((l for l in d["message"].splitlines() if l.startswith("URI: ")), "")[5:]')
  if [ "$uri" = "$ORIGIN" ]; then
    ok "POST /api/auth/challenge → 200, signed domain URI = $uri"
  else
    no "POST /api/auth/challenge → 200 but URI is '$uri'" \
       "the wallet would show the wrong domain; set APP_ORIGIN=$ORIGIN and redeploy."
  fi
else
  errcode=$(jget 'd.get("code") or ""')
  hint=$(jget 'd.get("hint") or d.get("error")')
  no "POST /api/auth/challenge → $status ${errcode:+($errcode)}" "$hint"
  case "$errcode" in
    APP_ORIGIN_MISSING|APP_ORIGIN_LOOPBACK|APP_ORIGIN_INVALID|ORIGIN_MISMATCH)
      say "        → environment fix, see docs/DEPLOY_ENV.md" ;;
    RATE_LIMIT_SALT_MISSING|SCHEMA_MISSING|DATABASE_MISSING|DATABASE_UNREACHABLE)
      say "        → database fix, see docs/DEPLOY_ENV.md" ;;
  esac
fi

# ---------------------------------------------------------------------- summary
say ""
say "-------------------------------------------"
say "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ] || exit 1
say "Server side looks right. Now do the browser pass (DevTools → Network):"
say "  1. open $ORIGIN/sign-in, connect a wallet, sign the message → should land on /app"
say "  2. /api/auth/challenge must be 200 with 'origin: $ORIGIN' in the request headers"
say "  3. in /app ask 'swap 0.01 ETH to USDG' → live route cards, no 403 in the console"
