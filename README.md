# VETTO: independent DeFi banker (Robinhood Chain)

Monorepo per the developer brief (§13). Next.js App Router + TypeScript + Tailwind + GSAP; PostgreSQL only (no Redis).

```
apps/web                Next.js app: landing, /app (chat), /docs, /sign-in, /sign-up, /api/*
packages/asset-registry token allowlist (nothing executable until verified)
packages/intent-parser  text -> typed intent, strict validator, exact decimal math
packages/safety-policy  SSRF/URL policy, approval policy, risk bands
packages/quote-engine   quote types, ranking, capability registry (single source of "what's real")
db/migrations           rate limits, idempotency, audit log
docs/                   integration matrix, threat model
```

## Run
```bash
corepack enable && pnpm install
pnpm test          # run all unit tests (node:test)
pnpm dev           # http://localhost:3000
```

## Read-only chain verification

Before enabling any chain integration, configure two independently operated RPC endpoints and the USDG address confirmed from an official source:

```powershell
$env:ROBINHOOD_RPC_URL_PRIMARY = "https://robinhood.drpc.org"
$env:ROBINHOOD_RPC_URL_SECONDARY = "https://robinhood.api.pocket.network"
$env:ROBINHOOD_USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
pnpm verify:chain
```

The checker validates chain ID 4663 on both RPCs, compares the Uniswap v4 PoolManager (listed in the [official Uniswap deployment feed](https://developers.uniswap.org/deployments.json)) and configured USDG contract bytecode at a common block, and checks that USDG reports symbol `USDG` with 6 decimals. It is read-only; a passing result does not establish pool liquidity, executable quotes, or transaction safety. Keep the integration matrix `planned` until the remaining Phase 0 evidence and sign-off are complete.

### Inspect one Uniswap v4 ETH/USDG pool

Only use `fee`, `tickSpacing`, and `hooks` taken from the exact pool's trusted `Initialize` event or official source. Then run:

```powershell
$env:ROBINHOOD_POOL_FEE = "8388608"
$env:ROBINHOOD_POOL_TICK_SPACING = "1"
$env:ROBINHOOD_POOL_HOOKS_ADDRESS = "0x987E330F00B79864a07FE81dFaC344D0078ABCC0"
pnpm verify:pool
```

The sample fee and spacing above are placeholders, not a claim that this pool exists. The read-only checker computes the v4 pool ID for native ETH/USDG, then compares initialization state and active liquidity across both RPCs at the same block. It does not estimate a trade, validate liquidity at a specific size, or prepare/submit a transaction.

## What is real today
- Landing page and animations, chat shell, docs, WalletConnect EOA sign-in using an Ethereum Mainnet (chain ID 1) message, one-time SIWE challenges, and database-backed sessions (requires `DATABASE_URL`, migrations, and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- Authenticated per-user chat prompt history at `/api/history`, with idempotent writes and a 100-entry retention cap. Preview-mode prompts remain in the current tab only.
- Intent preview + clarification, passive link policy check, honest "no route yet" quotes.
- **No** token execution, **no** live quotes: Phase 0 verification is still open. Sign-in is not transaction approval. Email/social login, contract wallets, and wallet-based execution are not implemented. See `docs/INTEGRATION_MATRIX.md`.

## Wallet sign-in setup
Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local`, configure `DATABASE_URL` and a non-default `RATE_LIMIT_SALT` (plus the exact HTTPS `APP_ORIGIN` in production), then run:
```bash
pnpm db:migrate
```
The wallet signs a short-lived, single-use SIWE message for Ethereum Mainnet (chain ID 1) to support wallets that do not recognize Robinhood Chain. This is sign-in only: VETTO does not send an Ethereum transaction, and the app's Robinhood Chain (4663) execution remains unavailable until verified. The server verifies EOA signatures and stores only a hash of the opaque session token; the browser receives an HttpOnly, SameSite=Lax cookie. Authentication never grants transaction authority.

Run `pnpm db:migrate` again to create the per-user chat history table. Only authenticated users' prompts are saved; preview mode stores prompts in the current tab only.

## Next steps (brief §20 order)
1. Phase 0: verify RPC, token addresses, v4 pools. Then flip registry/capability statuses.
2. Verify WalletConnect support for the target chain in deployment; add only verified WalletConnect hosts to CSP.
3. Direct-pool adapter in `apps/web/app/api/quotes/route.ts` `ADAPTERS`; simulation; wallet-signed execution + receipt.
4. Move rate limiting/idempotency to Postgres; extract `apps/api` and `apps/worker` (pg-boss) before Phase 3.

Vetto is independent and unaffiliated with Sotto Fi. Name not trademark-cleared.
