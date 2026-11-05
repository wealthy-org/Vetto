# Integration matrix (Phase 0 deliverable)

Statuses: `verified` · `planned` · `unsupported` · `blocked`. Flip a row only with a passing integration test, a demo tx receipt, and an owner sign-off.
The app and `GET /api/capabilities` read `packages/quote-engine/src/capabilities.ts`; keep them in sync.

The functional backend currently supports typed intent previews, an optional configured OpenAI-compatible intent parser with deterministic validation/fallback, passive URL policy checks, **live Uniswap v4 quotes for three ETH/USDG pools**, dual-RPC simulation of a fully built payload, and execution records whose status only moves on a chain receipt.
It does not yet submit transactions unless the operator enables `VETTO_SWAP_EXECUTION` after a funded receipt test; it never contacts inspected sites, and no private relay is claimed.
Evidence for every chain-facing row: [ROUTING_TRUTH_TABLE.md](./ROUTING_TRUTH_TABLE.md).

| Capability | Status | Needed to verify | Owner |
|---|---|---|---|
| Robinhood Chain RPC + chain ID 4663 | planned | Run `pnpm verify:chain` with two independently operated HTTPS RPCs and a USDG candidate address; the checker compares chain ID, PoolManager/token bytecode, symbol and decimals at a shared block. This does not establish USDG ownership or official status, pool liquidity, or transaction safety. | |
| Token addresses / decimals (ETH, USDG) | verified (on-chain) | ETH is the native currency; `USDG.symbol()/decimals()/name()` read as `USDG`/`6`/`Global Dollar` on two RPCs at a shared block. Issuer/official status still needs the project owner's confirmation — metadata alone does not prove it. | |
| Uniswap v4 quote adapter | verified | Three ETH/USDG pools (fee 500/3000/10000) answer `quoteExactInputSingle` with identical amounts and gas estimates on two independent RPCs. Routes are ranked by amount received; a pool that fails to quote is reported as skipped, never filled in. | |
| Robinhood Chain Quoter | verified | `0x8dc178eFB8111BB0973Dd9d722ebeFF267c98F94` answers real quotes, exposes `poolManager()` pointing at the v4 PoolManager, has identical bytecode on both RPCs, and reverts on unknown pools and zero amounts (i.e. it executes rather than echoing). Blockscout's verified-source view was not reachable from the verification environment (Cloudflare challenge). | |
| Robinhood Chain transaction router | partially verified | `0x8876789976dEcBfCbBbe364623C63652db8C0904` matches Uniswap's published Robinhood deployment, has identical bytecode on both RPCs, emits v4 `Swap` logs as `sender`, and reverts on invalid commands/selectors. Calldata is built server-side and simulated with `eth_call` from the user's wallet before any signature. **Execution stays off until a funded receipt test**, enabled per deployment via `VETTO_SWAP_EXECUTION`. | |
| Split route / solver / RFQ | planned | Real executable counterparties | |
| Private relay | blocked | A relay that accepts Robinhood Chain txs and is not mirrored to the public mempool. No such provider was verified; the UI toggle stays disabled and refuses private quotes rather than substituting a public route. | |
| Wallet sign-in | planned | SIWE EOA auth accepts chain-bound login messages from Ethereum Mainnet (1) or Robinhood Chain (4663); configure a WalletConnect project ID, run migrations, and test actual wallet support in deployment. This does not enable Robinhood Chain execution. | |
| Wallet balances | planned | Authenticated read-only ETH/USDG balances at a common block, compared across two RPCs; verify the configured USDG address against trusted official sources before treating its identity as verified. | |
| Per-user chat history | verified | Authenticated GET/POST/DELETE at `/api/history`; idempotent writes, bounded retention, user-scoped item/all-history deletion including cached responses, and desktop/mobile history access; preview history remains in-tab | |
| Social sign-in | planned | Audited provider; custodial labelling | |
| Simulation | verified (pre-signature) | Dual-RPC: chain id, common-block hash, bytecode of router/quoter/Permit2/USDG, quote equality, balance, Permit2 allowance, gas headroom, then `eth_call` of the exact payload. Asset-delta reporting (state diffs / traces) is **not** implemented yet, so `eth_call` success is still weaker than a fork simulation with deltas — recorded as a known limitation. | |
| Isolated browser fleet | planned | Per-session microVM/container, egress filter, verified teardown | |
| Burner signer | planned | Non-exportable / enclaved signer with spend ceiling, or wallet-controlled account | |
| Typed intent API | verified | Deterministic parser and validation tests; optional OpenAI-compatible parser is validated against the same asset registry and never grants execution authority | |
| Passive link inspection API | verified | Static HTTPS/public-host checks and cautious punycode/one-character brand lookalike warnings; no request is sent to the destination and warnings do not prove malicious intent | |
| Quote API | verified | `POST /api/quotes` returns 1–3 real routes with venue, min-out, gas estimate, price impact vs. a reference quote, expiry and a review fingerprint. It refuses private requests instead of substituting a public route. | |
| Transaction preparation | implemented, opt-in | Authenticated + idempotent `POST /api/execute/prepare` rebuilds the payload, requires the reviewed fingerprint to match, re-checks the reviewed minimum against a fresh dual-RPC quote, simulates, and stores an execution record with a payload hash. Returns `EXECUTION_DISABLED` unless `VETTO_SWAP_EXECUTION` is on (default off in production). | |
| Wallet-signed execution + receipt | implemented, pending funded test | The browser signs the byte-identical payload the server built; the wallet hash is only registered when the payload hash matches, and status becomes `confirmed`/`reverted` solely from a receipt whose `to`/`input`/`value` match the stored payload. No funded mainnet receipt exists yet. | |
| Production rate limiting | planned | Postgres-backed fixed-window limiter is implemented, but not enabled until `DATABASE_URL`, migrations, and a non-default `RATE_LIMIT_SALT` are configured and tested against the deployment DB | |

## Adding a status change

1. Produce the evidence (the command, the block, both providers' answers) and write it to
   [ROUTING_TRUTH_TABLE.md](./ROUTING_TRUTH_TABLE.md).
2. Flip the row here **and** `packages/quote-engine/src/capabilities.ts` in the same commit —
   the landing page, `/docs`, `/api/capabilities` and the chat UI all read that file.
3. Add or update a test that would fail if the claim became false again.
