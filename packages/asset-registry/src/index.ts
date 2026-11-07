/**
 * Token allowlist. The ONLY place symbols become addresses.
 *
 * Nothing here is trusted until it is verified against official sources
 * (Phase 0 checklist). Until then `status` is "unverified" and the asset can be
 * *named* in an intent but never *executed*. The parser/LLM never supplies addresses.
 */
/**
 * The deployment's chain. Mainnet (4663) is the default and the only profile the
 * project claims as verified; `VETTO_CHAIN_PROFILE=testnet` switches the whole
 * app to Robinhood Chain Testnet (46630) so the flow can be exercised with
 * faucet funds. Keep this in sync with apps/web/lib/chain-profile.ts.
 */
const PROFILE = (process.env.VETTO_CHAIN_PROFILE ?? "").trim().toLowerCase() === "testnet" ? "testnet" : "mainnet";

export const ROBINHOOD_CHAIN_ID = (PROFILE === "testnet" ? 46630 : 4663) as 4663 | 46630; // re-verify before launch
export const IS_TESTNET_PROFILE = PROFILE === "testnet";

export type AssetStatus = "verified" | "unverified";

export interface Asset {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** `native` for the gas token, a checksummed address once verified, null while unknown. */
  readonly address: `0x${string}` | "native" | null;
  readonly status: AssetStatus;
}

/**
 * Testnet tokens, discovered from real v4 pools on chain 46630 (both answered
 * `quoteExactInputSingle`). They are marked unverified: a test token is not an
 * asset anyone should trust with value.
 */
const TESTNET_ASSETS: readonly Asset[] = Object.freeze([
  { symbol: "ETH", name: "Test Ether", decimals: 18, address: "native", status: "verified" },
  {
    symbol: "HUNT",
    name: "HUNT (test token)",
    decimals: 18,
    address: "0x348be142c0f4ac4b90b91c02aaeef9f3d246c737" as `0x${string}`,
    status: "unverified",
  },
  {
    // Symbol matches the token's own symbol() on chain 46630.
    symbol: "DUCKCOIN",
    name: "DUCKCOIN (test token)",
    decimals: 18,
    address: "0xc77118728cda4cd2f5fe4b0d1fa866acb2d83365" as `0x${string}`,
    status: "unverified",
  },
]);

const MAINNET_ASSETS: readonly Asset[] = Object.freeze([
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    address: "native",
    status: "verified",
  },
  {
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    status: "verified",
  },
]);

const ASSETS: readonly Asset[] = IS_TESTNET_PROFILE ? TESTNET_ASSETS : MAINNET_ASSETS;

export function listAssets(): readonly Asset[] {
  return ASSETS;
}

export function findAsset(symbol: string): Asset | undefined {
  const s = symbol.trim().toUpperCase();
  return ASSETS.find((a) => a.symbol === s);
}

/** Only verified assets with a known address may reach the quote/execution path. */
export function isExecutableAsset(a: Asset | undefined): a is Asset {
  return !!a && a.status === "verified" && a.address !== null;
}
