# Deployment environment (Vercel / any Node host)

What the code actually reads, what is mandatory in production, and what must **not** be
copied from a local `.env.local`. Everything below is verified against
`process.env.*` references in `apps/web` — there is no other knob.

## Mandatory in production

| Variable | Why | Value on Vercel |
| --- | --- | --- |
| `APP_ORIGIN` | Origin the SIWE message is signed over, and the reference point for the same-origin (CSRF) guard. | **The deployment's own https origin**, e.g. `https://vetto.vercel.app` or `https://vetto.app`. Apex + www: `https://vetto.app,https://www.vetto.app`. |
| `DATABASE_URL` | Rate limiting, wallet sessions, chat history, execution receipts. | Postgres (Neon/Supabase). Run `pnpm db:migrate` against it once. |
| `RATE_LIMIT_SALT` | Hashes the client key for rate limiting; fails closed when missing/placeholder. | `openssl rand -hex 32` — 64 hex chars, never the example value. |
| `TRUST_PROXY_HOPS` | Which `x-forwarded-for` entry is the client. Without it every visitor shares one bucket. | `1` on Vercel/Cloudflare. |

## Required for full functionality

| Variable | Why | If unset |
| --- | --- | --- |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect (QR) sign-in. | The WalletConnect row stays disabled with a hint; injected wallets still work. |
| `ROBINHOOD_RPC_URL_PRIMARY` / `_SECONDARY` | Own RPC endpoints instead of the public defaults. | Public endpoints from `lib/robinhood-chain.ts` are used (rate-limited, fine for a demo). |
| `ROBINHOOD_USDG_ADDRESS` | Pins the USDG token address. | Falls back to the built-in registry value. Verify against an official source. |
| `LLM_API_KEY` (+ `LLM_API_URL`, `LLM_MODEL`) | Optional LLM intent parsing on top of the deterministic parser. | Deterministic parser only — no failure, just less fuzzy matching. |

## Must NOT be set in production

| Variable | Effect | Where it is allowed |
| --- | --- | --- |
| `VETTO_PREVIEW_EMBED` | Relaxes `frame-ancestors` **and** makes state-changing routes accept any `Origin` (preview proxies rewrite `Host`). | Local preview only. |
| `VETTO_ALLOW_MEMORY_LIMITS` | In-process rate limiter, resets on restart / differs per instance. | Local demo without a database. |
| `VETTO_SWAP_EXECUTION` | Enables wallet-signed swap submission. | Leave unset until receipt-level testing is done; production defaults to off. |
| `NEXT_PUBLIC_CHAIN_ID` | Only 4663 is supported; the UI hardcodes the chain. | Harmless, but pointless. |

Secrets (`DATABASE_URL`, `RATE_LIMIT_SALT`, `LLM_API_KEY`, RPC URLs with keys) belong in the
hosting dashboard only — never in the repo, never in chat.

## Verify a deployment

```bash
scripts/smoke-deploy.sh https://your-domain      # exit 0 = server side is healthy
```

It checks the app answers, `/api/capabilities` returns its 14 entries, a state-changing
route accepts the site's own `Origin`, a foreign `Origin` is still refused, and the SIWE
challenge signs the public origin (not a leftover `localhost`). Then do the browser pass:
sign in with a wallet and ask for a swap in `/app`.

## Checklist after changing any of them

1. `APP_ORIGIN` must match the URL you actually open, including scheme. A loopback value
   (`http://localhost:3000`) copied from `apps/web/.env.local` is the single most common
   deployment mistake: the API answers
   `503 APP_ORIGIN_LOOPBACK` with the value it should be set to.
2. Redeploy after editing environment variables — Vercel only injects them on a new build.
3. Verify from a browser (Origin headers are set by the browser, curl will not reproduce it):

```bash
curl -i -X POST https://<your-domain>/api/intent \
  -H 'content-type: application/json' \
  -H 'origin: https://<your-domain>' \
  -d '{"text":"swap 0.01 ETH to USDG"}'      # expect 200
```

```bash
curl -i https://<your-domain>/api/capabilities   # expect 200, 14 entries
```

## Error codes you may see on the sign-in screen

| Code | Meaning | Fix |
| --- | --- | --- |
| `APP_ORIGIN_MISSING` | Production build, no `APP_ORIGIN`, non-loopback host. | Set it. |
| `APP_ORIGIN_LOOPBACK` | `APP_ORIGIN` still points at `localhost`/`127.0.0.1` while the site is public. The response names the correct value. | Set `APP_ORIGIN` to the public origin, redeploy. |
| `APP_ORIGIN_INVALID` | Not a bare origin (has a path/trailing slash) or not https. | `https://your-domain` only. |
| `ORIGIN_MISMATCH` | The browser's `Origin` matched neither `APP_ORIGIN` nor the host the request arrived on. | Usually a custom domain / proxy that needs `APP_ORIGIN` updated. |
| `RATE_LIMIT_SALT_MISSING` | Salt unset or placeholder. | Generate one. |
| `SCHEMA_MISSING` | Database reachable but unmigrated. | `pnpm db:migrate`. |
