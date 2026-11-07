import { createPublicClient, getAddress, http, type Address } from "viem";

import { activeProfile } from "./chain-profile";

/** The deployment's chain: mainnet by default, testnet when VETTO_CHAIN_PROFILE=testnet. */
const PROFILE = activeProfile();

/**
 * Single source of truth for Robinhood Chain bindings used by quoting, simulation
 * and receipt reconciliation.
 *
 * Every address below was verified read-only on 4 November 2026 against two
 * independently operated RPC endpoints at a shared block (see
 * docs/ROUTING_TRUTH_TABLE.md for the recorded evidence):
 *
 *  - chainId 4663 on both endpoints, identical block hash at the common block
 *  - USDG symbol() = "USDG", name() = "Global Dollar", decimals() = 6
 *  - Quoter.poolManager() returns the PoolManager below
 *  - identical runtime bytecode (keccak256) for router/quoter/USDG/PoolManager
 *  - `quoteExactInputSingle` returns non-zero amounts for the three ETH/USDG
 *    pools registered in POOL_VENUES, and the values match across both RPCs
 *
 * Matching bytecode and live quotes are NOT a safety audit: quotes remain
 * display-only unless a simulation from the user's own wallet passes.
 */

export const ROBINHOOD_CHAIN_ID = PROFILE.chainId;

export const CHAIN = {
  id: PROFILE.chainId,
  name: PROFILE.name,
  nativeCurrency: PROFILE.nativeCurrency,
  explorer: PROFILE.explorer,
} as const;

export const IS_TESTNET = PROFILE.isTestnet;

export const CONTRACTS = PROFILE.contracts;

/** The quote asset for this chain: USDG on mainnet, the test token on testnet. */
export const USDG = {
  address: PROFILE.quoteAsset.address,
  symbol: PROFILE.quoteAsset.symbol,
  decimals: PROFILE.quoteAsset.decimals,
} as const;

export const NATIVE_ETH = {
  symbol: "ETH",
  decimals: 18,
  /** Uniswap v4 uses the zero address for the native currency. */
  address: "0x0000000000000000000000000000000000000000" as Address,
} as const;

export interface PoolVenue {
  /** Stable id used in quotes, fingerprints and audit logs. */
  id: string;
  label: string;
  poolKey: {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  };
}

/**
 * Pools proven to answer `quoteExactInputSingle` with a non-zero amount.
 * A v4 quoter reverts with `PoolNotInitialized` for unknown keys, so a
 * successful, repeatable quote from two providers is evidence the pool exists
 * with this exact key — it is not evidence of deep liquidity at your size.
 */
export const POOL_VENUES: readonly PoolVenue[] = PROFILE.venues;

export function findVenue(id: string): PoolVenue | undefined {
  return POOL_VENUES.find((venue) => venue.id === id);
}

/** Default RPCs: one official endpoint plus an independently operated one. */
export const DEFAULT_RPC_PRIMARY = PROFILE.rpcPrimary;
export const DEFAULT_RPC_SECONDARY = PROFILE.rpcSecondary;

/**
 * RPC endpoints for the active profile.
 *
 * The overrides are profile-qualified on purpose: `VETTO_CHAIN_PROFILE=testnet`
 * must never be served by `ROBINHOOD_RPC_URL_PRIMARY`, which points at mainnet
 * in every existing deployment. A testnet deployment that needs a private
 * endpoint sets `ROBINHOOD_TESTNET_RPC_URL_PRIMARY` instead.
 */
export function rpcUrlsFor(
  profile: { isTestnet: boolean; rpcPrimary: string; rpcSecondary: string | null },
  environment: NodeJS.ProcessEnv = process.env,
): { primary: string; secondary: string | null } {
  const prefix = profile.isTestnet ? "ROBINHOOD_TESTNET_RPC_URL" : "ROBINHOOD_RPC_URL";

  const override = (suffix: "PRIMARY" | "SECONDARY", fallback: string | null) => {
    const key = `${prefix}_${suffix}` as keyof NodeJS.ProcessEnv;
    return environment[key]?.trim() || fallback;
  };

  return {
    primary: override("PRIMARY", profile.rpcPrimary) as string,
    secondary: override("SECONDARY", profile.rpcSecondary),
  };
}

export function rpcUrls(environment: NodeJS.ProcessEnv = process.env): {
  primary: string;
  secondary: string | null;
} {
  return rpcUrlsFor(PROFILE, environment);
}

export function rpcClient(url: string, timeoutMs = 12_000) {
  return createPublicClient({
    transport: http(url, { timeout: timeoutMs, retryCount: 0 }),
  });
}

export const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const V4_QUOTER_POOL_MANAGER_ABI = [
  {
    type: "function",
    name: "poolManager",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

/** `quoteExactInputSingle` is nonpayable, so it is always used through eth_call. */
export const V4_QUOTER_QUOTE_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const PERMIT2_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

export interface ChainBinding {
  checkedAt: string;
  ok: boolean;
  checks: { id: string; ok: boolean; detail: string }[];
}

const globalState = globalThis as typeof globalThis & {
  __vettoChainBinding?: { at: number; value: Promise<ChainBinding> };
};

const BINDING_TTL_MS = 60_000;

/**
 * Read-only binding verification, cached for a minute. Failures are reported,
 * never swallowed: callers must treat `ok === false` as "no executable route".
 */
export function verifyChainBindings(): Promise<ChainBinding> {
  const cached = globalState.__vettoChainBinding;
  if (cached && Date.now() - cached.at < BINDING_TTL_MS) return cached.value;

  const value = runBindingChecks();
  globalState.__vettoChainBinding = { at: Date.now(), value };
  return value;
}

async function runBindingChecks(): Promise<ChainBinding> {
  const checkedAt = new Date().toISOString();
  const checks: ChainBinding["checks"] = [];
  const push = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  const urls = rpcUrls();

  try {
    const primary = rpcClient(urls.primary);

    const chainId = await primary.getChainId();
    push("chain-id", chainId === ROBINHOOD_CHAIN_ID, `primary RPC chainId=${chainId}`);

    if (chainId !== ROBINHOOD_CHAIN_ID) {
      return { checkedAt, ok: false, checks };
    }

    const [poolManagerOfQuoter, symbol, decimals] = await Promise.all([
      primary.readContract({
        address: CONTRACTS.v4Quoter,
        abi: V4_QUOTER_POOL_MANAGER_ABI,
        functionName: "poolManager",
      }),
      primary.readContract({ address: USDG.address, abi: ERC20_ABI, functionName: "symbol" }),
      primary.readContract({ address: USDG.address, abi: ERC20_ABI, functionName: "decimals" }),
    ]);

    push(
      "quoter-wiring",
      getAddress(poolManagerOfQuoter) === CONTRACTS.poolManager,
      `V4Quoter.poolManager()=${poolManagerOfQuoter}`,
    );
    push("usdg-metadata", symbol === USDG.symbol && Number(decimals) === USDG.decimals, `symbol=${symbol} decimals=${decimals}`);

    const codes = await Promise.all([
      primary.getBytecode({ address: CONTRACTS.universalRouter }),
      primary.getBytecode({ address: CONTRACTS.v4Quoter }),
      primary.getBytecode({ address: USDG.address }),
      primary.getBytecode({ address: CONTRACTS.permit2 }),
    ]);
    push(
      "contracts-deployed",
      codes.every((code) => typeof code === "string" && code !== "0x" && code.length > 2),
      "router, quoter, USDG and Permit2 all have runtime code",
    );

    if (urls.secondary) {
      try {
        const secondary = rpcClient(urls.secondary);
        const secondaryChainId = await secondary.getChainId();
        push(
          "secondary-chain-id",
          secondaryChainId === ROBINHOOD_CHAIN_ID,
          `secondary RPC chainId=${secondaryChainId}`,
        );
      } catch (error) {
        push("secondary-chain-id", false, `secondary RPC unavailable: ${errorText(error)}`);
      }
    } else {
      push("secondary-chain-id", false, "no independent secondary RPC configured");
    }
  } catch (error) {
    push("rpc", false, errorText(error));
  }

  return { checkedAt, ok: checks.every((check) => check.ok), checks };
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 200);
  return String(error).slice(0, 200);
}

/**
 * Swap execution is opt-in per deployment. Quoting works everywhere, but a
 * transaction is only offered when the operator explicitly enables it after
 * their own small-value receipt test (brief §16.15, §20).
 */
export function swapExecutionEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  const flag = environment.VETTO_SWAP_EXECUTION?.trim().toLowerCase();
  if (flag === "on" || flag === "enabled" || flag === "true") return true;
  if (flag === "off" || flag === "disabled" || flag === "false") return false;
  // Unset: allowed in development so the flow can be demoed locally,
  // fail-closed in production until an operator opts in.
  return environment.NODE_ENV !== "production";
}
