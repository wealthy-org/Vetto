# Routing truth table — Robinhood Chain (chainId 4663)

**Recorded:** 4 November 2026
**Method:** read-only JSON-RPC calls from two independently operated endpoints, compared
at a shared block. No transaction was signed or broadcast.

| Role | Value |
|---|---|
| RPC A (official public) | `https://rpc.mainnet.chain.robinhood.com` |
| RPC B (independent operator) | `https://robinhood.drpc.org` |
| Common block used for comparison | `106043957` (both endpoints returned the same block hash) |

Run `/api/capabilities` or `lib/robinhood-chain.ts` for the live values; this file records
what was actually observed.

## Contract bindings

| Contract | Address | Evidence | Status |
|---|---|---|---|
| PoolManager (Uniswap v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | identical runtime bytecode on both RPCs; `V4Quoter.poolManager()` returns this address | verified |
| V4Quoter | `0x8dc178eFB8111BB0973Dd9d722ebeFF267c98F94` | identical bytecode on both RPCs; `poolManager()` wired; `quoteExactInputSingle` returns non-zero amounts and reverts (`execution reverted`) for an unknown pool/zero amount | verified |
| UniversalRouter (Uniswap v2.1.1) | `0x8876789976dEcBfCbBbe364623C63652db8C0904` | listed in Uniswap's Robinhood deployment file; identical bytecode on both RPCs; appears as `sender` on 27 v4 `Swap` logs in a 100-block window; reverts on an invalid command byte and on an unknown selector, so it decodes v4 commands rather than accepting anything | verified for quoting/simulation; **execution pending a funded receipt test** |
| Alternate router observed | `0x204FAca1764B154221e35c0d20aBb3c525710498` | also emits v4 `Swap` logs (3 in the same window) with different bytecode | not used by VETTO |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | identical bytecode on both RPCs | verified |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `symbol()` = `USDG`, `name()` = `Global Dollar`, `decimals()` = `6`, identical bytecode on both RPCs | on-chain identity verified — **issuer/official status still needs the project owner's confirmation** |

## ETH/USDG pools that actually answered a quote

A v4 quoter reverts with `PoolNotInitialized` for a key that does not exist, so a
reproducible, non-zero answer is evidence the pool exists with exactly this key.

| Venue id | fee | tickSpacing | hooks | 10 USDG → ETH (wei) | 1,000 USDG → ETH (wei) | 0.01 ETH → USDG |
|---|---|---|---|---|---|---|
| `rh-v4-eth-usdg-500` | 500 | 10 | `0x0` | 4,109,227,412,499,896 | 410,872,065,960,415,321 | 24,304,961 |
| `rh-v4-eth-usdg-3000` | 3000 | 60 | `0x0` | 4,093,947,344,102,547 | 408,842,204,338,016,247 | 24,254,530 |
| `rh-v4-eth-usdg-10000` | 10000 | 200 | `0x0` | 4,091,561,700,154,106 | 394,663,460,376,250,068 | 23,876,019 |

Every value above was returned **identically by both RPC endpoints** at the common block,
including the quoter's gas estimate. Any mismatch aborts simulation rather than being
averaged or ignored.

## What this table does **not** claim

- It does not prove liquidity *at your trade size* beyond the quoted amounts above; the
  quote itself is the only evidence, and it expires in 15 seconds.
- It does not prove the router's v4 path is safe for value. That is why execution stays
  opt-in (`VETTO_SWAP_EXECUTION`) until a small-value transaction produces a real receipt.
- It does not establish that USDG is the canonically "official" Robinhood Chain stablecoin —
  only that the contract at that address reports those metadata values on chain.
- No private relay exists on this chain that was verified, so private submission stays
  `unavailable`. The UI never offers it.

## Reproduce

```bash
# both endpoints must report chainId 4663 and the same block hash
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  https://rpc.mainnet.chain.robinhood.com

pnpm verify:chain    # chain id + bytecode + token metadata at a common block
pnpm verify:pool     # PoolManager storage vs Uniswap StateView for one pool key
```
