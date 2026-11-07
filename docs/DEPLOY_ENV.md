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
| ↳ when the key is rejected | A 401/403/429 disables the LLM parser for 10 min (auth) or 60 s (quota); people see one calm line, never the provider error. | Watch `llmParser` on `GET /api/capabilities`: `ok` / `cooling` / `off`. |

## Must NOT be set in production

| Variable | Effect | Where it is allowed |
| --- | --- | --- |
| `VETTO_PREVIEW_EMBED` | Relaxes `frame-ancestors` **and** makes state-changing routes accept any `Origin` (preview proxies rewrite `Host`). | Local preview only. |
| `VETTO_ALLOW_MEMORY_LIMITS` | In-process rate limiter, resets on restart / differs per instance. | Local demo without a database. |
| `VETTO_SWAP_EXECUTION` | Enables wallet-signed swap submission. | Leave unset until receipt-level testing is done; production defaults to off. |
| `NEXT_PUBLIC_CHAIN_ID` | Superseded by the chain profile; nothing reads it for routing. | Harmless, but pointless. |
| `VETTO_CHAIN_PROFILE` / `NEXT_PUBLIC_VETTO_CHAIN_PROFILE` = `testnet` | Moves the deployment to chain 46630 and labels every money surface "test funds only". | Intended for a staging deployment — never on the production domain. |

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
| `DATABASE_PASSWORD_MISSING` | `DATABASE_URL` has no password but the server answers with SCRAM (`SASL: ... client password must be a string`). | Put a password in the URL (`postgresql://user:password@host:5432/db`, URL-encode `@` `#` `:`) or set `PGPASSWORD`. A cluster started with `initdb --auth=trust` needs none. |

## What a deployment changes about capability labels

`GET /api/capabilities` is deployment-aware. The registry in
`packages/quote-engine/src/capabilities.ts` is identical in every environment,
but the endpoint (and `/docs/status`, and the landing "What's live" section once
the fetch resolves) promotes exactly three ids to **verified** when *this*
deployment can carry a transaction:

| Condition | Promoted |
|---|---|
| `VETTO_SWAP_EXECUTION=on` **and** `DATABASE_URL` set | `permit2-approval`, `transaction-prepare`, `execution-history` |
| anything else | none — the registry's own labels are returned |

Nothing else is ever promoted by configuration. A relay, solver, market maker,
burner machine or isolated browser needs a counterparty or compute that hosting
cannot provide, so those stay Planned / Unavailable on every deployment.

## Testnet mode (chain 46630)

Testnet mode exists so the whole flow — parse, quote, simulate, sign, receipt —
can be walked end to end with faucet ETH that is worth nothing. It is a *whole
deployment* switch, never a per-request option:

```bash
VETTO_CHAIN_PROFILE=testnet            # server: which chain the API quotes and simulates on
NEXT_PUBLIC_VETTO_CHAIN_PROFILE=testnet # browser: which chain the UI labels
```

Leave both unset for mainnet (4663). Set both and redeploy: `NEXT_PUBLIC_*` is
inlined into the browser bundle at build time, so changing it only in the hosting
dashboard leaves the old bundle labelling the UI. If the two disagree, nothing is
silently corrected — `GET /api/capabilities` reports `chain.profileMismatch: true`
and the UI keeps the server's chain for what actually runs.

What changes on testnet:

| | Mainnet (4663) | Testnet (46630) |
| --- | --- | --- |
| RPC | `rpc.mainnet.chain.robinhood.com` + `robinhood.drpc.org` | `rpc.testnet.chain.robinhood.com` (no second operator) |
| Quoter | `0x8dc178…8F94` | `0x4E4744228…EEF31` (bound to the same PoolManager) |
| UniversalRouter | `0x8876789…0904` | `0x69DcB1b74…23De` (its `v4PoolManager` arg is that PoolManager) |
| Pools | ETH/USDG 500 / 3000 / 10000 | ETH/HUNT and ETH/DUCKCOIN, fee 0, tick spacing 60, with hooks |
| Assets | ETH, USDG | ETH, HUNT, DUCK — test tokens, marked unverified |
| Label | `Robinhood Chain · 4663` | `Robinhood Chain Testnet · 46630` + a "test funds only" banner |

RPC overrides are profile-qualified: `ROBINHOOD_RPC_URL_*` is read on mainnet
only, `ROBINHOOD_TESTNET_RPC_URL_*` on testnet only. That way an existing
deployment's mainnet endpoint cannot silently serve quotes for chain 46630.

Permit2 is the canonical `0x000000000022D473030F116dDEE9F6B43aC78BA3` on both.
No independent RPC operator is known for 46630, so the cross-check that mainnet
performs across two providers degrades to one provider here; quotes are labelled
accordingly and are still read straight from the pool, never interpolated.

Two consequences worth knowing before you flip the switch:

- **No independent RPC operator exists for 46630**, so the simulator's dual-provider
  cross-check degrades to a single provider. It never pretends otherwise:
  `simulation.crossChecked` is `false` and the route review shows
  "RPC cross-check — single provider (this chain has one)". Mainnet still runs the
  full block-hash + bytecode + quote comparison across two providers.
- **Test tokens are `unverified` but executable.** Status describes identity
  verification and stays `unverified` in the UI; `executable: true` in the registry
  is a separate, explicit clearance needed to reach quote/simulate/prepare. On
  mainnet only `verified` assets are executable, so nothing changed there.

Safety rules that do not change on testnet: execution still needs
`VETTO_SWAP_EXECUTION` **and** `DATABASE_URL`, signing still happens in the
wallet, and no capability is promoted that the registry does not already list.

## Wallets: signing, chain switching and the execute path

- Sign-in and execute resolve the wallet from the address the swap was reviewed for:
  an injected wallet already authorised for it is used first (`lib/execute-provider.ts`),
  WalletConnect only when no browser wallet holds that address. Execute used to always
  open WalletConnect, which looked like "the wrong wallet" when MetaMask had signed in.
- The chain is always read with `eth_chainId`, never from a provider's cached
  `chainId` property (undefined right after a WalletConnect session restore). A wallet
  on the wrong chain is switched, or has the chain added (4902), before signing.
- Refusals say what to do and end with "Nothing was sent."

## Wallets: why the WalletConnect list looks short

VETTO's own picker (`/sign-in`) offers Phantom, MetaMask, Rabby, Coinbase Wallet
(as injected EIP-1193 providers, plus a Phantom deeplink on mobile) and a separate
WalletConnect row. Phantom is **not** missing from the app — it is missing from the
*WalletConnect modal's* "All Wallets" list, which is a different thing:

- That list is fetched from WalletConnect's explorer, filtered by the chains the
  provider asks for (`optionalChains`). A chain nobody lists (4663, 46630) filters
  out nearly every wallet, Phantom included. Upstream reports the same effect for
  other niche chains (reown-com/appkit#2961).
- Declaring `eip155:1` next to the deployment's chain widens that list, but the
  session then settles on mainnet and the provider's own `setChainId()` throws while
  restoring it — the browser reported exactly that as `Cannot read properties of
  undefined (reading 'request')` in `switchEthereumChain`. The chain list therefore
  stays at the deployment's chain alone; an off-chain wallet is switched/added
  explicitly by `ensureRobinhoodChain`. Making Phantom a *featured* wallet in that
  modal needs Reown AppKit (`featuredWalletIds`), which this app does not use.
- WalletConnect can never be the reliable route to Phantom on a custom chain. The
  picker's Phantom row (extension) and its mobile deeplink
  (`https://phantom.app/ul/browse/<origin>`) are.

## LLM parser: which key goes in which variable

There is no shared key and none can be handed out — a key is issued to your own
provider account, and a made-up one is exactly what produces the HTTP 401 in the
chat. Pick one provider, create the key there, then copy the three rows.

| Provider | Where the key is created | `LLM_API_URL` | `LLM_MODEL` (pick one from the provider's list) |
|---|---|---|---|
| OpenAI | platform.openai.com → API keys | `https://api.openai.com/v1/chat/completions` | `gpt-4o-mini` |
| Groq (free tier, no card) | console.groq.com → API keys | `https://api.groq.com/openai/v1/chat/completions` | `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `llama-3.3-70b-versatile`* |
| Google Gemini (free tier) | aistudio.google.com → Get API key | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | `gemini-2.5-flash` |
| OpenRouter (has `:free` models) | openrouter.ai → Keys | `https://openrouter.ai/api/v1/chat/completions` | e.g. `meta-llama/llama-3.3-70b-instruct:free` |
| Anything self-hosted / OpenAI-compatible | your server | `https://your-host/v1/chat/completions` | your model id |

\* Model ids change; take the current one from the provider's model list rather than
copying this table months later. `LLM_REASONING_EFFORT` is optional and off by
default — some OpenAI-compatible providers reject the field, and a 400 is exactly
what you get when they do.

### Check the key before you paste it into Vercel

```bash
cd vetto
LLM_API_KEY=sk-... \
LLM_API_URL=https://api.groq.com/openai/v1/chat/completions \
LLM_MODEL=openai/gpt-oss-120b \
./scripts/check-llm.sh
```

`✓ Key works. … JSON mode: ok · parsed kind: swap` means all three values agree.
The script sends the same request shape the app sends, never prints the key, and
maps the usual failures: 401 = wrong/revoked key, 404 = wrong URL or model,
400 = unsupported field or model id, 429 = rate limited (the key is fine).

If you have no key, leave `LLM_API_KEY` unset. The deterministic parser handles
swaps, link checks and capped agent tasks, and no warning appears at all.
