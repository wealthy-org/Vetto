/**
 * Token allowlist. The ONLY place symbols become addresses.
 *
 * Nothing here is trusted until it is verified against official sources
 * (Phase 0 checklist). Until then `status` is "unverified" and the asset can be
 * *named* in an intent but never *executed*. The parser/LLM never supplies addresses.
 */
export const ROBINHOOD_CHAIN_ID = 4663 as const; // from the project brief — re-verify before launch

export type AssetStatus = "verified" | "unverified";

export interface Asset {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** `native` for the gas token, a checksummed address once verified, null while unknown. */
  readonly address: `0x${string}` | "native" | null;
  readonly status: AssetStatus;
}

const ASSETS: readonly Asset[] = Object.freeze([
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
