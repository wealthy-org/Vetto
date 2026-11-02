# Integration matrix (Phase 0 deliverable)

Statuses: `verified` · `planned` · `unsupported` · `blocked`. Flip a row only with a passing integration test, a demo tx receipt, and an owner sign-off.
The app and `GET /api/capabilities` read `packages/quote-engine/src/capabilities.ts`; keep them in sync.

The functional backend currently supports typed intent previews, an optional configured OpenAI-compatible intent parser with deterministic validation/fallback, and passive URL policy checks.
It does not submit transactions, contact inspected sites, or claim any chain venue is live.

| Capability | Status | Needed to verify | Owner |
|---|---|---|---|
| Robinhood Chain RPC + chain ID 4663 | planned | Run `pnpm verify:chain` with two independently operated HTTPS RPCs and a USDG candidate address; the checker compares chain ID, PoolManager/token bytecode, symbol and decimals at a shared block. This does not establish USDG ownership or official status, pool liquidity, or transaction safety. | |
| Token addresses / decimals (ETH, USDG) | planned | Confirm on-chain; set `status: "verified"` in `asset-registry` | |
| Uniswap v4 direct pool adapter | planned | `pnpm discover:pools` compares exact ETH/USDG `Initialize` logs across two RPCs. `pnpm verify:pool` checks PoolManager storage against the official StateView and compares current pool state at a common block. Then verify liquidity for a requested trade size, a real executable quote, and simulation/test transaction before enabling an adapter. Read-only state alone is not a quote or liquidity guarantee. | |
| Robinhood Chain Quoter | blocked | No V4Quoter is published in the reviewed official deployment sources. The previously hardcoded address resolves on Blockscout to `contracts/StubContract.sol`, not a Quoter. Identify a real quote mechanism and verify source, ABI, runtime code and independent-provider results. | |
| Robinhood Chain transaction router | planned | Uniswap's [Robinhood deployment file](https://github.com/Uniswap/universal-router/blob/edf19bfde87e6cf5b29046f6ca2f483a4ffd6ae6/deploy-addresses/robinhood.json) lists UniversalRouter v2.1.1 at `0x8876789976decbfcbbbe364623c63652db8c0904`; Blockscout reports a partial source match. Verify exact runtime behavior and the v4 exact-input path, then test calldata, approval scope, simulation and a controlled receipt before enabling execution. Do not use the v2.1.2 entry until its deployment is verified; Blockscout currently labels that address as `StubContract.sol`. | |
| Split route / solver / RFQ | planned | Real executable counterparties | |
| Private relay | blocked | A relay that accepts Robinhood Chain txs and is not mirrored to the public mempool | |
| Wallet sign-in | planned | SIWE EOA auth accepts chain-bound login messages from Ethereum Mainnet (1) or Robinhood Chain (4663); configure a WalletConnect project ID, run migrations, and test actual wallet support in deployment. This does not enable Robinhood Chain execution. | |
| Wallet balances | planned | Authenticated read-only ETH/USDG balances at a common block, compared across two RPCs; verify the configured USDG address against trusted official sources before treating its identity as verified. | |
| Per-user chat history | verified | Authenticated GET/POST/DELETE at `/api/history`; idempotent writes, bounded retention, user-scoped item/all-history deletion including cached responses, and desktop/mobile history access; preview history remains in-tab | |
| Social sign-in | planned | Audited provider; custodial labelling | |
| Simulation provider | planned | Fork or chain-compatible simulation that reports asset + allowance deltas on this chain; `eth_call` success alone is not sufficient | |
| Isolated browser fleet | planned | Per-session microVM/container, egress filter, verified teardown | |
| Burner signer | planned | Non-exportable / enclaved signer with spend ceiling, or wallet-controlled account | |
| Typed intent API | verified | Deterministic parser and validation tests; optional OpenAI-compatible parser is validated against the same asset registry and never grants execution authority | |
| Passive link inspection API | verified | Static HTTPS/public-host checks and cautious punycode/one-character brand lookalike warnings; no request is sent to the destination and warnings do not prove malicious intent | |
| Quote API | planned | Returns no routes until an executable adapter and asset addresses are verified | |
| Transaction preparation | planned | Authenticated and idempotent API fails closed; enable unsigned payloads only after verified assets, a real quoting mechanism, router path, simulation, approval inspection, and audit tests | |
| Wallet-signed execution + receipt | planned | Use the connected user's wallet only; verify exact route fingerprint, recipient, spender, calldata and amount, then persist pending/confirmed/reverted status with an explorer receipt after a controlled integration test | |
| Production rate limiting | planned | Postgres-backed fixed-window limiter is implemented, but not enabled until `DATABASE_URL`, migrations, and a non-default `RATE_LIMIT_SALT` are configured and tested against the deployment DB | |
