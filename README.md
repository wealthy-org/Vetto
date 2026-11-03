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
$env:ROBINHOOD_RPC_URL_PRIMARY = ""
$env:ROBINHOOD_RPC_URL_SECONDARY = "https://robinhood-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY"
$env:ROBINHOOD_USDG_ADDRESS = ""
pnpm verify:chain
```

Robinhood Chain's official developer site lists Alchemy as a recommended RPC provider. Create an Alchemy app for **Robinhood Mainnet** and use its HTTPS URL as the secondary endpoint; keep the API key in your local PowerShell session, not in this README, chat, or a committed file. The free tier documents a maximum `eth_getLogs` range of 10 blocks for Robinhood Mainnet, so set `$env:ROBINHOOD_POOL_SCAN_CHUNK_SIZE = "10"` when using it. See [Alchemy's Robinhood RPC details](https://www.alchemy.com/rpc/robinhood) and [`eth_getLogs` range limits](https://www.alchemy.com/docs/chains/ethereum/ethereum-api-endpoints/eth-get-logs).

The checker validates chain ID 4663 on both RPCs, compares the Uniswap v4 PoolManager (listed in the [official Uniswap deployment feed](https://developers.uniswap.org/deployments.json)) and configured USDG contract bytecode at a common block, and checks that USDG reports symbol `USDG` with 6 decimals. Uniswap's [Universal Router deployment file](https://github.com/Uniswap/universal-router/blob/edf19bfde87e6cf5b29046f6ca2f483a4ffd6ae6/deploy-addresses/robinhood.json) lists v2.1.1 at `0x8876789976decbfcbbbe364623c63652db8c0904`; Blockscout reports only a partial source match, so verify its runtime code before use. The v2.1.2 entry currently resolves to a `StubContract` on Blockscout. No Robinhood Chain V4Quoter is verified: the Quoter address previously checked here resolves to `StubContract.sol`, not a Quoter. Matching bytecode and token metadata do not establish USDG ownership or official status. This read-only check does not establish pool liquidity, executable quotes, or transaction safety. Keep quotes and execution disabled until a real quoting path, router, simulation, and controlled receipt test are verified.

### Discover Uniswap v4 ETH/USDG pools

Find the PoolManager deployment block from the [Blockscout contract page](https://robinhoodchain.blockscout.com/address/0x8366a39CC670B4001A1121B8F6A443A643e40951), set it as a trusted starting block, then scan a bounded range. The scan is limited to 250,000 blocks per run; if the deployment is older than that, set an end block and run consecutive ranges. A scan only establishes results for the printed block range.
Set `ROBINHOOD_POOL_SCAN_CHUNK_SIZE` to the provider's maximum `eth_getLogs` range. For Alchemy's free Robinhood Mainnet tier, use `10`; smaller chunks increase the number of RPC requests. Keep test ranges small before attempting a larger scan.

```powershell
$env:ROBINHOOD_POOL_SCAN_FROM_BLOCK = "9070"
$env:ROBINHOOD_POOL_SCAN_TO_BLOCK = "10069"
$env:ROBINHOOD_POOL_SCAN_CHUNK_SIZE = "10"
pnpm discover:pools
```

Discovery compares matching Uniswap v4 `Initialize` logs across both RPCs, decodes the actual pool key, and checks current initialization state and active liquidity at the common block. It does not estimate a trade, validate liquidity at a specific size, or prepare/submit a transaction. Keep quotes and execution disabled until an executable quote and simulation are independently verified.

To inspect a single pool key when you already have its verified values, set `ROBINHOOD_POOL_FEE`, `ROBINHOOD_POOL_TICK_SPACING`, and `ROBINHOOD_POOL_HOOKS_ADDRESS`, then run `pnpm verify:pool`.
The checker compares PoolManager storage with the official Uniswap v4 StateView (`getSlot0` and `getLiquidity`) at the same block on both RPCs. The Robinhood StateView address is listed in [Uniswap's Robinhood fork test](https://github.com/Uniswap/v4-periphery/blob/c6e4754dab11bd38c6f08ac51c3c868569e93d64/test/ReservesLens.fork.t.sol). This remains read-only verification; it is not a quote or a transaction safety check.

## What is real today
- Landing page and animations, chat shell, docs, WalletConnect EOA sign-in using a chain-bound message on Ethereum Mainnet (chain ID 1) or Robinhood Chain (4663), one-time SIWE challenges, and database-backed sessions (requires `DATABASE_URL`, migrations, and `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- Signed-in users can view read-only ETH/USDG balances at a shared Robinhood Chain block, compared across both configured RPCs. The USDG address must be configured; symbol/decimals checks do not prove token ownership or official status.
- Authenticated per-user chat prompt history at `/api/history`, with idempotent writes, a 100-entry retention cap, and a mobile history drawer. Preview-mode prompts remain in the current tab only.
- Intent preview + clarification, passive link policy check, and Robinhood v4 quote review for the configured ETH/USDG pair. Quotes are display-only; transaction execution is disabled.
- Passive link checks flag blocked URL patterns, punycode, and simple lookalikes of selected crypto brands. These are heuristic signals only; target sites are not contacted and no safety guarantee is made.
- **No token execution.** Robinhood v4 quote retrieval is available for the configured pair, but quotes are display-only and are not authorization or transaction-safety guarantees. Sign-in is not transaction approval. Email/social login, contract wallets, and wallet-based execution are not implemented. See `docs/INTEGRATION_MATRIX.md`.
- Quote review currently uses the configured Robinhood v4 quote adapter. Returned quotes are display-only and cannot execute swaps. No demo price is presented as a live market quote.

## Wallet sign-in setup
Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `apps/web/.env.local`, configure `DATABASE_URL` and a non-default `RATE_LIMIT_SALT` (plus the exact HTTPS `APP_ORIGIN` in production), then run:
```bash
pnpm db:migrate
```
The wallet signs a short-lived, single-use SIWE message on Ethereum Mainnet (chain ID 1) or Robinhood Chain (4663), depending on the active WalletConnect chain. This is sign-in only: VETTO does not send a transaction, and Robinhood Chain execution remains unavailable until separately verified. The server accepts only these two chain IDs, verifies EOA signatures, and stores only a hash of the opaque session token; the browser receives an HttpOnly, SameSite=Lax cookie. Authentication never grants transaction authority. Test the configured WalletConnect project with the actual target wallets in deployment before treating chain support as verified.

Run `pnpm db:migrate` again to create the per-user chat history table. Only authenticated users' prompts are saved; preview mode stores prompts in the current tab only. Saved requests can be deleted individually or cleared from the app; deletion also removes their cached idempotency responses.

## Next steps (brief §20 order)
1. Phase 0: verify RPC, token identity and v4 pools; separately identify and verify a Robinhood Chain-compatible Quoter and transaction router before enabling quotes or execution.
2. Verify WalletConnect support for the target chain in deployment; the app advertises Ethereum Mainnet and Robinhood Chain to WalletConnect, while CSP allows only explicit WalletConnect hosts when configured.
3. Implement the direct-pool adapter only after the router is verified; add transaction simulation, exact-approval checks, wallet-signed execution, and receipt/history integration.
4. Move rate limiting/idempotency to Postgres; extract `apps/api` and `apps/worker` (pg-boss) before Phase 3.

Vetto is independent and unaffiliated with Sotto Fi. Name not trademark-cleared.
