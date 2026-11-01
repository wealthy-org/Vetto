# Integration matrix (Phase 0 deliverable)

Statuses: `verified` · `planned` · `unsupported` · `blocked`. Flip a row only with a passing integration test, a demo tx receipt, and an owner sign-off.
The app and `GET /api/capabilities` read `packages/quote-engine/src/capabilities.ts`; keep them in sync.

The functional backend currently supports typed intent previews and passive URL policy checks.
It does not submit transactions, contact inspected sites, or claim any chain venue is live.

| Capability | Status | Needed to verify | Owner |
|---|---|---|---|
| Robinhood Chain RPC + chain ID 4663 | planned | Run `pnpm verify:chain` with two independently operated HTTPS RPCs and the officially verified USDG address; the checker compares chain ID, shared-block contract bytecode, symbol and decimals. This is read-only and does not verify pool liquidity or authorize execution. | |
| Token addresses / decimals (ETH, USDG) | planned | Confirm on-chain; set `status: "verified"` in `asset-registry` | |
| Uniswap v4 direct pool adapter | planned | `pnpm discover:pools` compares exact ETH/USDG `Initialize` logs across two RPCs. `pnpm verify:pool` checks PoolManager storage against the official StateView and compares current pool state at a common block. Then verify liquidity for a requested trade size, a real executable quote, and simulation/test transaction before enabling an adapter. Read-only state alone is not a quote or liquidity guarantee. | |
| Split route / solver / RFQ | planned | Real executable counterparties | |
| Private relay | blocked | A relay that accepts Robinhood Chain txs and is not mirrored to the public mempool | |
| Wallet sign-in | planned | SIWE EOA auth uses Ethereum Mainnet (chain ID 1) for message signing only; configure a WalletConnect project ID and run migrations. This does not enable Robinhood Chain execution. | |
| Per-user chat history | verified | Authenticated GET/POST/DELETE at `/api/history`; idempotent writes, bounded retention, and user-scoped item/all-history deletion including cached responses; preview history remains in-tab | |
| Social sign-in | planned | Audited provider; custodial labelling | |
| Simulation provider | planned | Asset + allowance deltas on this chain | |
| Isolated browser fleet | planned | Per-session microVM/container, egress filter, verified teardown | |
| Burner signer | planned | Non-exportable / enclaved signer with spend ceiling, or wallet-controlled account | |
| Typed intent API | verified | Deterministic parser and validation tests | |
| Passive link inspection API | verified | Static HTTPS/public-host checks; no request is sent to the destination | |
| Quote API | planned | Returns no routes until an executable adapter and asset addresses are verified | |
| Transaction preparation | planned | Authenticated and idempotent API fails closed; enable unsigned payloads only after verified assets, route, simulation, and audit tests | |
| Production rate limiting | planned | Postgres-backed fixed-window limiter is implemented, but not enabled until `DATABASE_URL`, migrations, and a non-default `RATE_LIMIT_SALT` are configured and tested against the deployment DB | |
