import { getAddress, type Address } from "viem";

/**
 * Chain profiles: mainnet and testnet.
 *
 * Mainnet (4663) is the default and the only profile the project claims as
 * verified. Testnet (46630) exists so the whole flow — parse, quote, simulate,
 * sign, receipt — can be exercised with faucet ETH that has no value. It is
 * selected per deployment, never per request:
 *
 *   VETTO_CHAIN_PROFILE=testnet            (server)
 *   NEXT_PUBLIC_VETTO_CHAIN_PROFILE=testnet (client, inlined at build time)
 *
 * Both must be set, and the deployment must be redeployed so the client bundle
 * and the server agree. If they disagree the app is inconsistent, so the client
 * value wins for display and the server value wins for what actually runs — the
 * mismatch check below surfaces it in `/api/capabilities` instead of silently
 * mixing chains.
 *
 * Every testnet address below was read back from the testnet explorer/RPC on
 * 7 Nov 2026: bytecode present, quoter bound to the PoolManager, and
 * `quoteExactInputSingle` returning a non-zero amount for the pools listed.
 */

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type ProfileKey = "mainnet" | "testnet";

export interface ProfileAsset {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  /** `native` for the gas token. */
  readonly address: Address | "native";
  /** Shown in the UI so nobody mistakes a test token for the real one. */
  readonly testOnly?: boolean;
}

export interface ProfileVenue {
  readonly id: string;
  readonly label: string;
  readonly poolKey: {
    readonly currency0: Address;
    readonly currency1: Address;
    readonly fee: number;
    readonly tickSpacing: number;
    readonly hooks: Address;
  };
}

export interface ChainProfile {
  readonly key: ProfileKey;
  readonly chainId: number;
  readonly name: string;
  /** Short label for the header chip. */
  readonly badge: string;
  readonly isTestnet: boolean;
  readonly nativeCurrency: { readonly name: string; readonly symbol: string; readonly decimals: number };
  readonly explorer: string;
  readonly rpcPrimary: string;
  readonly rpcSecondary: string | null;
  readonly contracts: {
    readonly poolManager: Address;
    readonly v4Quoter: Address;
    readonly universalRouter: Address;
    readonly permit2: Address;
  };
  /** The quote asset on this chain (USDG on mainnet; the test token pair on testnet). */
  readonly quoteAsset: { readonly address: Address; readonly symbol: string; readonly decimals: number };
  readonly assets: readonly ProfileAsset[];
  readonly venues: readonly ProfileVenue[];
  /** Pool hooks are part of the pool key: a wrong hooks address makes the quoter revert. */
  readonly notes: string;
}

export const MAINNET_PROFILE: ChainProfile = {
  key: "mainnet",
  chainId: 4663,
  name: "Robinhood Chain",
  badge: "4663",
  isTestnet: false,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  explorer: "https://robinhoodchain.blockscout.com",
  rpcPrimary: "https://rpc.mainnet.chain.robinhood.com",
  rpcSecondary: "https://robinhood.drpc.org",
  contracts: {
    poolManager: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    v4Quoter: getAddress("0x8dc178eFB8111BB0973Dd9d722ebeFF267c98F94"),
    universalRouter: getAddress("0x8876789976dEcBfCbBbe364623C63652db8C0904"),
    permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  },
  quoteAsset: {
    address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    symbol: "USDG",
    decimals: 6,
  },
  assets: [
    { symbol: "ETH", name: "Ether", decimals: 18, address: "native" },
    { symbol: "USDG", name: "Global Dollar", decimals: 6, address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") },
  ],
  venues: [
    {
      id: "rh-v4-eth-usdg-500",
      label: "Uniswap v4 · ETH/USDG · 0.05%",
      poolKey: {
        currency0: ZERO_ADDRESS,
        currency1: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
        fee: 500,
        tickSpacing: 10,
        hooks: ZERO_ADDRESS,
      },
    },
    {
      id: "rh-v4-eth-usdg-3000",
      label: "Uniswap v4 · ETH/USDG · 0.30%",
      poolKey: {
        currency0: ZERO_ADDRESS,
        currency1: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
        fee: 3000,
        tickSpacing: 60,
        hooks: ZERO_ADDRESS,
      },
    },
    {
      id: "rh-v4-eth-usdg-10000",
      label: "Uniswap v4 · ETH/USDG · 1.00%",
      poolKey: {
        currency0: ZERO_ADDRESS,
        currency1: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
        fee: 10000,
        tickSpacing: 200,
        hooks: ZERO_ADDRESS,
      },
    },
  ],
  notes: "Verified against two RPC endpoints at a shared block (docs/ROUTING_TRUTH_TABLE.md).",
};

const TESTNET_HUNT = getAddress("0x348be142c0f4ac4b90b91c02aaeef9f3d246c737");
const TESTNET_DUCK = getAddress("0xc77118728cda4cd2f5fe4b0d1fa866acb2d83365");

export const TESTNET_PROFILE: ChainProfile = {
  key: "testnet",
  chainId: 46630,
  name: "Robinhood Chain Testnet",
  badge: "Testnet · 46630",
  isTestnet: true,
  nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
  explorer: "https://explorer.testnet.chain.robinhood.com",
  rpcPrimary: "https://rpc.testnet.chain.robinhood.com",
  // No independent operator known for 46630, so there is no cross-check endpoint.
  rpcSecondary: null,
  contracts: {
    poolManager: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    // Three quoters are bound to that PoolManager; 0x4E47… is the one this
    // profile uses. All three returned identical quotes when checked.
    v4Quoter: getAddress("0x4E474422826915f36597348CC183330EdD9EEF31"),
    // Verified from its decoded constructor args on the testnet explorer:
    // RouterParameters.v4PoolManager == the PoolManager above. Deployments that
    // point at a different PoolManager (e.g. 0x897147… → 0x37e402b8…) are not
    // interchangeable — routing through one would revert.
    universalRouter: getAddress("0x69DcB1b7436EBA5c6C9CaB2064763810F36923De"),
    permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  },
  quoteAsset: { address: TESTNET_HUNT, symbol: "HUNT", decimals: 18 },
  assets: [
    { symbol: "ETH", name: "Test Ether", decimals: 18, address: "native" },
    { symbol: "HUNT", name: "HUNT (test token)", decimals: 18, address: TESTNET_HUNT, testOnly: true },
    { symbol: "DUCKCOIN", name: "DUCKCOIN (test token)", decimals: 18, address: TESTNET_DUCK, testOnly: true },
  ],
  venues: [
    {
      id: "tn-v4-eth-hunt",
      label: "Uniswap v4 (testnet) · ETH/HUNT · hook",
      poolKey: {
        currency0: ZERO_ADDRESS,
        currency1: TESTNET_HUNT,
        fee: 0,
        tickSpacing: 60,
        hooks: getAddress("0xa5e27e3e54739162fe52c2c48e55b6dd6572e8ec"),
      },
    },
    {
      id: "tn-v4-eth-duckcoin",
      label: "Uniswap v4 (testnet) · ETH/DUCKCOIN · hook",
      poolKey: {
        currency0: ZERO_ADDRESS,
        currency1: TESTNET_DUCK,
        fee: 0,
        tickSpacing: 60,
        hooks: getAddress("0xe61e46724ba5dec31f2be031106558774a65e8ec"),
      },
    },
  ],
  notes:
    "Test funds only. Pools carry a hook, so the hooks address is part of the key; both pools answered quoteExactInputSingle when checked on 7 Nov 2026.",
};

export const PROFILES: Record<ProfileKey, ChainProfile> = {
  mainnet: MAINNET_PROFILE,
  testnet: TESTNET_PROFILE,
};

function parseKey(value: string | undefined): ProfileKey {
  return value?.trim().toLowerCase() === "testnet" ? "testnet" : "mainnet";
}

/** Server-side profile (what actually runs). */
export function serverProfile(environment: NodeJS.ProcessEnv = process.env): ChainProfile {
  return PROFILES[parseKey(environment.VETTO_CHAIN_PROFILE)];
}

/**
 * Client-side profile: `NEXT_PUBLIC_*` is inlined at build time, so a client
 * component can render the right chain chip without a request.
 */
export function publicProfileKey(): ProfileKey {
  return parseKey(
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_VETTO_CHAIN_PROFILE : undefined,
  );
}

/**
 * The profile for the environment this code is running in. On the client we
 * must read the `NEXT_PUBLIC_*` value (inlined at build time); on the server we
 * read the real one. Deployments set both, so they agree.
 */
export function activeProfile(environment: NodeJS.ProcessEnv = process.env): ChainProfile {
  if (typeof window !== "undefined") return PROFILES[publicProfileKey()];
  return serverProfile(environment);
}

export function profileFor(key: ProfileKey): ChainProfile {
  return PROFILES[key];
}

/** True when the build and the server were configured for different chains. */
export function profileMismatch(environment: NodeJS.ProcessEnv = process.env): boolean {
  const server = parseKey(environment.VETTO_CHAIN_PROFILE);
  const client = parseKey(environment.NEXT_PUBLIC_VETTO_CHAIN_PROFILE);
  return server !== client;
}
