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

### Discover Uniswap v4 ETH/USDG pools

Find the PoolManager deployment block from the [Blockscout contract page](https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951), set it as a trusted starting block, then scan a bounded range. The scan is limited to 250,000 blocks per run; if the deployment is older than that, set an end block and run consecutive ranges. A scan only establishes results for the printed block range.

```powershell
$env:ROBINHOOD_POOL_SCAN_FROM_BLOCK = "<decimal-start-block>"
$env:ROBINHOOD_POOL_SCAN_TO_BLOCK = "<decimal-end-block>"
pnpm discover:pools
```

Discovery compares matching Uniswap v4 `Initialize` logs across both RPCs, decodes the actual pool key, and checks current initialization state and active liquidity at the common block. It does not estimate a trade, validate liquidity at a specific size, or prepare/submit a transaction. Keep quotes and execution disabled until an executable quote and simulation are independently verified.

To inspect a single pool key when you already have its verified values, set `ROBINHOOD_POOL_FEE`, `ROBINHOOD_POOL_TICK_SPACING`, and `ROBINHOOD_POOL_HOOKS_ADDRESS`, then run `pnpm verify:pool`.
The checker compares PoolManager storage with the official Uniswap v4 StateView (`getSlot0` and `getLiquidity`) at the same block on both RPCs. The Robinhood StateView address is listed in [Uniswap's Robinhood fork test](https://github.com/Uniswap/v4-periphery/blob/c6e4754dab11bd38c6f08ac51c3c868569e93d64/test/ReservesLens.fork.t.sol). This remains read-only verification; it is not a quote or a transaction safety check.

## What is real today
- Landing page and animations, chat shell, docs, WalletConnect EOA sign-in using a chain-bound message on Ethereum Mainnet (chain ID 1) or Robinhood Chain (4663), one-time SIWE challenges, and database-backed sessions (requires `DATABASE_URL`, migrations, and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- Signed-in users can view read-only ETH/USDG balances at a shared Robinhood Chain block, compared across both configured RPCs. The USDG address must be configured; symbol/decimals checks do not prove token ownership or official status.
- Authenticated per-user chat prompt history at `/api/history`, with idempotent writes, a 100-entry retention cap, and a mobile history drawer. Preview-mode prompts remain in the current tab only.
- Intent preview + clarification, passive link policy check, honest "no route yet" quotes.
- **No** token execution, **no** live quotes: Phase 0 verification is still open. Sign-in is not transaction approval. Email/social login, contract wallets, and wallet-based execution are not implemented. See `docs/INTEGRATION_MATRIX.md`.

## Wallet sign-in setup
Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local`, configure `DATABASE_URL` and a non-default `RATE_LIMIT_SALT` (plus the exact HTTPS `APP_ORIGIN` in production), then run:
```bash
pnpm db:migrate
```
The wallet signs a short-lived, single-use SIWE message on Ethereum Mainnet (chain ID 1) or Robinhood Chain (4663), depending on the active WalletConnect chain. This is sign-in only: VETTO does not send a transaction, and Robinhood Chain execution remains unavailable until separately verified. The server accepts only these two chain IDs, verifies EOA signatures, and stores only a hash of the opaque session token; the browser receives an HttpOnly, SameSite=Lax cookie. Authentication never grants transaction authority. Test the configured WalletConnect project with the actual target wallets in deployment before treating chain support as verified.

Run `pnpm db:migrate` again to create the per-user chat history table. Only authenticated users' prompts are saved; preview mode stores prompts in the current tab only. Saved requests can be deleted individually or cleared from the app; deletion also removes their cached idempotency responses.

## Next steps (brief §20 order)
1. Phase 0: verify RPC, token addresses, v4 pools. Then flip registry/capability statuses.
2. Verify WalletConnect support for the target chain in deployment; the app advertises Ethereum Mainnet and Robinhood Chain to WalletConnect, while CSP allows only explicit WalletConnect hosts when configured.
3. Direct-pool adapter in `apps/web/app/api/quotes/route.ts` `ADAPTERS`; simulation; wallet-signed execution + receipt.
4. Move rate limiting/idempotency to Postgres; extract `apps/api` and `apps/worker` (pg-boss) before Phase 3.

Vetto is independent and unaffiliated with Sotto Fi. Name not trademark-cleared.
