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
pnpm test          # 25 zero-dependency unit tests (node:test)
pnpm dev           # http://localhost:3000
```

## What is real today
- Landing page and animations, chat shell, docs, WalletConnect EOA sign-in using an Ethereum Mainnet (chain ID 1) message, one-time SIWE challenges, and database-backed sessions (requires `DATABASE_URL`, migrations, and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- Intent preview + clarification, passive link policy check, honest "no route yet" quotes.
- **No** token execution, **no** live quotes: Phase 0 verification is still open. Sign-in is not transaction approval. Email/social login, contract wallets, and wallet-based execution are not implemented. See `docs/INTEGRATION_MATRIX.md`.

## Wallet sign-in setup
Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local`, configure `DATABASE_URL` and a non-default `RATE_LIMIT_SALT` (plus the exact HTTPS `APP_ORIGIN` in production), then run:
```bash
pnpm db:migrate
```
The wallet signs a short-lived, single-use SIWE message for Ethereum Mainnet (chain ID 1) to support wallets that do not recognize Robinhood Chain. This is sign-in only: VETTO does not send an Ethereum transaction, and the app's Robinhood Chain (4663) execution remains unavailable until verified. The server verifies EOA signatures and stores only a hash of the opaque session token; the browser receives an HttpOnly, SameSite=Lax cookie. Authentication never grants transaction authority.

## Next steps (brief §20 order)
1. Phase 0: verify RPC, token addresses, v4 pools. Then flip registry/capability statuses.
2. Verify WalletConnect support for the target chain in deployment; add only verified WalletConnect hosts to CSP.
3. Direct-pool adapter in `apps/web/app/api/quotes/route.ts` `ADAPTERS`; simulation; wallet-signed execution + receipt.
4. Move rate limiting/idempotency to Postgres; extract `apps/api` and `apps/worker` (pg-boss) before Phase 3.

Vetto is independent and unaffiliated with Sotto Fi. Name not trademark-cleared.
