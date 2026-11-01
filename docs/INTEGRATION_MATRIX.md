# Integration matrix (Phase 0 deliverable)

Statuses: `verified` · `planned` · `unsupported` · `blocked`. Flip a row only with a passing integration test, a demo tx receipt, and an owner sign-off.
The app and `GET /api/capabilities` read `packages/quote-engine/src/capabilities.ts`; keep them in sync.

The functional backend currently supports typed intent previews and passive URL policy checks.
It does not submit transactions, contact inspected sites, or claim any chain venue is live.

| Capability | Status | Needed to verify | Owner |
|---|---|---|---|
| Robinhood Chain RPC + chain ID 4663 | planned | Confirm against official docs; compare ≥2 endpoints | |
| Token addresses / decimals (ETH, USDG) | planned | Confirm on-chain; set `status: "verified"` in `asset-registry` | |
| Uniswap v4 direct pool adapter | planned | Real liquid pool; simulation passes; testnet/fork tx | |
| Split route / solver / RFQ | planned | Real executable counterparties | |
| Private relay | blocked | A relay that accepts Robinhood Chain txs and is not mirrored to the public mempool | |
| Wallet sign-in | planned | SIWE EOA auth uses Ethereum Mainnet (chain ID 1) for message signing only; configure a WalletConnect project ID and run migrations. This does not enable Robinhood Chain execution. | |
| Social sign-in | planned | Audited provider; custodial labelling | |
| Simulation provider | planned | Asset + allowance deltas on this chain | |
| Isolated browser fleet | planned | Per-session microVM/container, egress filter, verified teardown | |
| Burner signer | planned | Non-exportable / enclaved signer with spend ceiling, or wallet-controlled account | |
| Typed intent API | verified | Deterministic parser and validation tests | |
| Passive link inspection API | verified | Static HTTPS/public-host checks; no request is sent to the destination | |
| Quote API | planned | Returns no routes until an executable adapter and asset addresses are verified | |
| Production rate limiting | planned | Postgres-backed fixed-window limiter is implemented, but not enabled until `DATABASE_URL`, migrations, and a non-default `RATE_LIMIT_SALT` are configured and tested against the deployment DB | |
