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
- Landing page and animations, chat shell, docs, auth screens (UI only).
- Intent preview + clarification, passive link policy check, honest "no route yet" quotes.
- **No** wallet connection, **no** execution, **no** live quotes: Phase 0 verification is still open. See `docs/INTEGRATION_MATRIX.md`.

## Next steps (brief §20 order)
1. Phase 0: verify RPC, token addresses, v4 pools. Then flip registry/capability statuses.
2. Wallet sign-in (wagmi) + add hosts to CSP `connect-src`.
3. Direct-pool adapter in `apps/web/app/api/quotes/route.ts` `ADAPTERS`; simulation; wallet-signed execution + receipt.
4. Move rate limiting/idempotency to Postgres; extract `apps/api` and `apps/worker` (pg-boss) before Phase 3.

Vetto is independent and unaffiliated with Sotto Fi. Name not trademark-cleared.
