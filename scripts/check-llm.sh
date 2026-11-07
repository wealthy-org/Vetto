#!/usr/bin/env bash
# Check an LLM provider key before you put it in the hosting dashboard.
#
#   LLM_API_KEY=... LLM_API_URL=... LLM_MODEL=... ./scripts/check-llm.sh
#
# It sends the exact request shape apps/web/lib/llm-parser.ts sends (JSON mode,
# no reasoning_effort unless LLM_REASONING_EFFORT is set) and tells you whether
# the key, the URL and the model all work together. The key is never printed.
#
# Exit codes: 0 = usable, 1 = rejected, 2 = misconfigured, 3 = network.
set -uo pipefail

URL="${LLM_API_URL:-https://api.openai.com/v1/chat/completions}"
MODEL="${LLM_MODEL:-gpt-4o-mini}"
KEY="${LLM_API_KEY:-}"
EFFORT="${LLM_REASONING_EFFORT:-}"

if [ -z "$KEY" ]; then
  echo "✗ LLM_API_KEY is empty."
  echo "  Get a key from your provider (see docs/DEPLOY_ENV.md), then:"
  echo "    LLM_API_KEY=sk-... $0"
  exit 2
fi

case "$URL" in
  https://*|http://localhost*|http://127.0.0.1*) ;;
  *) echo "✗ LLM_API_URL must be https (http only for localhost). The app refuses anything else."; exit 2 ;;
esac

# The same system prompt shape the app uses, trimmed: one JSON object back.
BODY=$(python3 -c '
import json, os
effort = os.environ.get("LLM_REASONING_EFFORT", "").strip()
payload = {
    "model": os.environ["LLM_MODEL"],
    "temperature": 0,
    "max_tokens": 128,
    "response_format": {"type": "json_object"},
    "messages": [
        {"role": "system", "content": "Return only JSON with either a swap intent {\"kind\":\"swap\",\"chainId\":4663,\"tokenIn\":\"SYMBOL\",\"tokenOut\":\"SYMBOL\",\"amountIn\":\"decimal\",\"privateRequested\":false} or {\"kind\":\"clarification\",\"question\":\"short question\"}. Known symbols: ETH, USDG."},
        {"role": "user", "content": "swap 0.01 ETH to USDG"},
    ],
}
if effort:
    payload["reasoning_effort"] = effort
print(json.dumps(payload))
' LLM_MODEL="$MODEL" LLM_REASONING_EFFORT="$EFFORT")

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

START=$(date +%s%3N)
STATUS=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  --max-time 45 \
  -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY" 2>/dev/null)
CURL_RC=$?
END=$(date +%s%3N)

if [ "$CURL_RC" -ne 0 ]; then
  echo "✗ Could not reach $URL (curl exit $CURL_RC)."
  echo "  Check the host name and that this machine has outbound HTTPS."
  exit 3
fi

ELAPSED=$((END - START))
python3 - "$RESPONSE_FILE" "$STATUS" "$ELAPSED" "$MODEL" "$URL" <<'PY'
import json, os, sys

path, status, elapsed, model, url = sys.argv[1:6]
key = os.environ.get("LLM_API_KEY", "")
raw = open(path, encoding="utf-8", errors="replace").read()
status = int(status)
elapsed = int(elapsed)

def scrub(text: str) -> str:
    if key:
        text = text.replace(key, "[redacted]")
    return " ".join(text.split())[:400]

if status != 200:
    detail = ""
    try:
        body = json.loads(raw)
        err = body.get("error")
        detail = err.get("message", "") if isinstance(err, dict) else (err if isinstance(err, str) else "")
    except Exception:
        detail = raw
    hints = {
        401: "key rejected — create a new one, and make sure it belongs to this provider",
        403: "key valid but not allowed to use this model / region",
        404: "LLM_API_URL is wrong (should end in /chat/completions) or the model does not exist",
        400: "the provider rejected the request — most often an unknown model id, or a field it does not support (try without LLM_REASONING_EFFORT)",
        429: "key works, but you are rate-limited right now",
    }
    print(f"✗ HTTP {status} from {url}")
    if detail:
        print(f"  provider says: {scrub(detail)}")
    if status in hints:
        print(f"  → {hints[status]}")
    sys.exit(1)

try:
    body = json.loads(raw)
    content = body["choices"][0]["message"]["content"]
    parsed = json.loads(content)
except Exception:
    print(f"✓ HTTP 200 from {url}, but the reply was not a JSON object.")
    print("  The app needs response_format=json_object support. Pick another model.")
    sys.exit(1)

kind = parsed.get("kind")
print(f"✓ Key works. {model} answered in {elapsed} ms.")
print(f"  JSON mode: ok · parsed kind: {kind}")
if kind not in {"swap", "clarification"}:
    print("  → the app only accepts those two kinds; anything else falls back to the built-in parser.")
PY
