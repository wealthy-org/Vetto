import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  http,
  type Address,
} from "viem";

import { buildUniversalRouterV4Swap } from "../scripts/universal-router-v4.mjs";
import {
  CONTRACTS,
  ERC20_ABI,
  NATIVE_ETH,
  PERMIT2_ABI,
  POOL_VENUES,
  ROBINHOOD_CHAIN_ID,
  V4_QUOTER_QUOTE_ABI,
  findVenue,
  rpcUrls,
} from "./robinhood-chain";
import { serverProfile } from "./chain-profile";

/**
 * Pre-signature simulation.
 *
 * The payload is always rebuilt on the server from the reviewed intent and a
 * registered venue — calldata never comes from the browser. Before anything is
 * offered for signature we:
 *   1. verify both RPCs are on Robinhood Chain,
 *   2. agree on a common block and compare its hash,
 *   3. compare runtime bytecode of router / quoter / Permit2 / the traded token,
 *   4. fetch the same quote from both providers and require an exact match,
 *   5. re-check the reviewed minimum output against the fresh quote,
 *   6. check balances, Permit2 allowance and gas headroom,
 *   7. run the exact payload through `eth_call` from the user's wallet.
 *
 * Any mismatch aborts. `broadcast` is always false: this module never sends a
 * transaction.
 */

const CHAIN_ID = ROBINHOOD_CHAIN_ID;
const ROUTER: Address = CONTRACTS.universalRouter;
const QUOTER: Address = CONTRACTS.v4Quoter;
const PERMIT2: Address = CONTRACTS.permit2;
const ZERO_ADDRESS = NATIVE_ETH.address;

export interface SimulationInput {
  wallet: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  slippageBps: number;
  /** Registered venue id; defaults to the first pool that pairs the token with ETH. */
  venueId?: string;
  /** Minimum output the user already reviewed; the fresh quote must still clear it. */
  reviewedMinOutBaseUnits?: string;
}

type SimulatorClient = ReturnType<typeof createPublicClient>;

export interface SimulationDependencies {
  createClient?: (rpc: string) => SimulatorClient;
  now?: () => number;
}

export interface SimulationResult {
  status: "passed" | "failed";
  chainId: number;
  wallet: Address;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  venueId?: string;
  /** False when only one RPC provider answered (no independent cross-check exists). */
  crossChecked: boolean;
  expectedOutBaseUnits?: string;
  minOutBaseUnits?: string;
  gasPriceWei?: string;
  estimatedGas?: string;
  quoteBlockNumber?: string;
  quoteBlockHash?: string;
  transaction?: {
    to: Address;
    data: `0x${string}`;
    value: string;
    deadline: string;
  };
  allowance?: {
    /** Current Permit2 allowance for the sell token, in base units. */
    permit2Allowance?: string;
    /** Unix seconds at which the Permit2 grant expires. */
    permit2Expiration?: number;
    /** Current ERC-20 allowance granted to Permit2, in base units. */
    tokenToPermit2Allowance?: string;
    /** How much the swap needs, in base units. */
    required: string;
    satisfied: boolean;
  };
  reason?: string;
  broadcast: false;
}

function validateRpcUrl(value: string, label: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} RPC URL is invalid.`);
  }

  if (
    url.protocol !== "https:"
    && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error(`${label} RPC must use HTTPS.`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} RPC URL must not contain credentials.`);
  }

  return url;
}

function decodeQuote(data: `0x${string}` | undefined) {
  if (!data || data === "0x") {
    throw new Error("Quoter returned empty data.");
  }

  const result = decodeFunctionResult({
    abi: V4_QUOTER_QUOTE_ABI,
    functionName: "quoteExactInputSingle",
    data,
  });

  if (result[0] <= 0n || result[1] <= 0n) {
    throw new Error("Quoter returned an invalid result.");
  }

  return { expectedOut: result[0], gasEstimate: result[1] };
}

export async function simulateRobinhoodV4Swap(
  input: SimulationInput,
  dependencies: SimulationDependencies = {},
): Promise<SimulationResult> {
  const wallet = getAddress(input.wallet);

  if (!/^\d+$/.test(input.amountInBaseUnits)) {
    throw new Error("Invalid input amount.");
  }

  const amountIn = BigInt(input.amountInBaseUnits);

  if (amountIn <= 0n || amountIn >= 2n ** 128n) {
    throw new Error("Input amount is outside uint128 bounds.");
  }

  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps >= 10_000) {
    throw new Error("Invalid slippage.");
  }

  const tokenIn = input.tokenIn.toUpperCase();
  const tokenOut = input.tokenOut.toUpperCase();

  // The token paired with native ETH is whatever this deployment registers pools
  // for (USDG on mainnet, the test tokens on 46630). Resolved from the registry,
  // never from the request.
  const profile = serverProfile();
  const other = tokenIn === "ETH" ? tokenOut : tokenIn;
  const otherAsset = profile.assets.find(
    (asset) => asset.symbol === other && asset.address !== "native",
  );

  const zeroForOne = tokenIn === "ETH" && other === tokenOut && otherAsset !== undefined;

  if (!otherAsset || (zeroForOne ? tokenOut !== other : tokenIn !== other && tokenOut !== "ETH")) {
    throw new Error(`Only ETH/${profile.quoteAsset.symbol} swaps are supported on this deployment.`);
  }

  const venue = input.venueId
    ? findVenue(input.venueId)
    : POOL_VENUES.find(
        (candidate) =>
          candidate.poolKey.currency1.toLowerCase() === otherAsset.address.toString().toLowerCase(),
      );

  if (!venue) {
    throw new Error("Unknown trading venue.");
  }

  if (venue.poolKey.currency1.toLowerCase() !== otherAsset.address.toString().toLowerCase()) {
    throw new Error("That venue does not pair this token with ETH.");
  }

  // The ERC-20 leg of this swap (native ETH has no token contract).
  const erc20: Address = otherAsset.address as Address;

  let reviewedMinOut: bigint | null = null;
  if (input.reviewedMinOutBaseUnits !== undefined) {
    if (!/^\d+$/.test(input.reviewedMinOutBaseUnits)) {
      throw new Error("Invalid reviewed minimum output.");
    }
    reviewedMinOut = BigInt(input.reviewedMinOutBaseUnits);
  }

  const urls = rpcUrls();
  const primaryRpc = urls.primary;
  const secondaryRpc = urls.secondary;

  if (!primaryRpc) {
    throw new Error("Primary RPC configuration is missing.");
  }

  const primaryUrl = validateRpcUrl(primaryRpc, "Primary");
  // Not every chain has a second, independently operated endpoint. Mainnet does and
  // keeps its cross-check; a chain without one (today: testnet 46630) runs
  // single-provider and says so, instead of pretending it verified anything.
  const secondaryUrl = secondaryRpc ? validateRpcUrl(secondaryRpc, "Secondary") : null;

  if (secondaryUrl && primaryUrl.origin === secondaryUrl.origin) {
    throw new Error("Primary and secondary RPC must use different origins.");
  }

  const nowMs = dependencies.now?.() ?? Date.now();
  const nowSeconds = BigInt(Math.floor(nowMs / 1000));

  const createClient =
    dependencies.createClient
    ?? ((url: string) => createPublicClient({ transport: http(url, { timeout: 15_000, retryCount: 0 }) }));

  const primary = createClient(primaryRpc);
  const secondary = secondaryUrl ? createClient(secondaryRpc as string) : null;
  /** True when two independent providers agreed on the block, bytecode and quote. */
  const crossChecked = secondary !== null;

  const primaryChainId = await primary.getChainId();
  const secondaryChainId = secondary ? await secondary.getChainId() : primaryChainId;

  if (primaryChainId !== CHAIN_ID || secondaryChainId !== CHAIN_ID) {
    throw new Error("One or both RPC providers are not on Robinhood Chain.");
  }

  const primaryHead = await primary.getBlockNumber();
  const secondaryHead = secondary ? await secondary.getBlockNumber() : primaryHead;

  const commonBlock = primaryHead < secondaryHead ? primaryHead : secondaryHead;

  const primaryBlock = await primary.getBlock({ blockNumber: commonBlock });
  const secondaryBlock = secondary ? await secondary.getBlock({ blockNumber: commonBlock }) : primaryBlock;

  if (
    !primaryBlock.hash
    || !secondaryBlock.hash
    || primaryBlock.hash.toLowerCase() !== secondaryBlock.hash.toLowerCase()
  ) {
    throw new Error("RPC block hash mismatch at common block.");
  }

  const watched = [
    { name: "Router", address: ROUTER },
    { name: "Quoter", address: QUOTER },
    { name: "Permit2", address: PERMIT2 },
    { name: otherAsset.symbol, address: erc20 },
  ] as const;

  const primaryCodes = await Promise.all(
    watched.map((c) => primary.getBytecode({ address: c.address, blockNumber: commonBlock })),
  );
  const secondaryCodes = secondary
    ? await Promise.all(
        watched.map((c) => secondary.getBytecode({ address: c.address, blockNumber: commonBlock })),
      )
    : primaryCodes;

  for (let index = 0; index < watched.length; index += 1) {
    const primaryCode = primaryCodes[index];
    const secondaryCode = secondaryCodes[index];

    if (!primaryCode || primaryCode === "0x" || !secondaryCode || secondaryCode === "0x") {
      throw new Error(`${watched[index]!.name} bytecode is unavailable.`);
    }

    if (primaryCode.toLowerCase() !== secondaryCode.toLowerCase()) {
      throw new Error(`${watched[index]!.name} bytecode mismatch between RPCs.`);
    }
  }

  const quoteData = encodeFunctionData({
    abi: V4_QUOTER_QUOTE_ABI,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: venue.poolKey, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
  });

  const primaryQuoteCall = await primary.call({ to: QUOTER, data: quoteData, blockNumber: commonBlock });
  const secondaryQuoteCall = secondary
    ? await secondary.call({ to: QUOTER, data: quoteData, blockNumber: commonBlock })
    : primaryQuoteCall;

  const primaryQuote = decodeQuote(primaryQuoteCall.data);
  const secondaryQuote = decodeQuote(secondaryQuoteCall.data);

  if (
    primaryQuote.expectedOut !== secondaryQuote.expectedOut
    || primaryQuote.gasEstimate !== secondaryQuote.gasEstimate
  ) {
    throw new Error("RPC quote mismatch. Simulation stopped for safety.");
  }

  const expectedOut = primaryQuote.expectedOut;
  // The slippage band exists to absorb small moves between review and simulation, so
  // the fresh *expected* output only has to clear what the person reviewed — and the
  // transaction then enforces exactly that reviewed minimum on chain.
  const freshMinOut = (expectedOut * BigInt(10_000 - input.slippageBps)) / 10_000n;
  const minOut = reviewedMinOut ?? freshMinOut;

  const [gasPrice, nativeBalance, tokenBalance] = await Promise.all([
    primary.getGasPrice(),
    primary.getBalance({ address: wallet, blockNumber: commonBlock }),
    zeroForOne
      ? Promise.resolve(0n)
      : primary.readContract({
          address: erc20,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [wallet],
          blockNumber: commonBlock,
        }),
  ]);

  const inputBalance = zeroForOne ? nativeBalance : tokenBalance;

  const baseResult = {
    chainId: CHAIN_ID,
    wallet,
    tokenIn,
    tokenOut,
    venueId: venue.id,
    crossChecked,
    amountInBaseUnits: amountIn.toString(),
    expectedOutBaseUnits: expectedOut.toString(),
    minOutBaseUnits: minOut.toString(),
    gasPriceWei: gasPrice.toString(),
    quoteBlockNumber: commonBlock.toString(),
    quoteBlockHash: primaryBlock.hash,
    broadcast: false as const,
  };

  // The reviewed minimum must still be reachable with the fresh quote.
  if (reviewedMinOut !== null && expectedOut < reviewedMinOut) {
    return {
      ...baseResult,
      status: "failed",
      reason:
        "Quote moved. The minimum output you reviewed is no longer achievable at this price.",
    };
  }

  if (inputBalance < amountIn) {
    return { ...baseResult, status: "failed", reason: "Insufficient input-token balance." };
  }

  let allowance: SimulationResult["allowance"];

  if (!zeroForOne) {
    const [tokenAllowance, permitAllowance] = await Promise.all([
      primary.readContract({
        address: erc20,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [wallet, PERMIT2],
        blockNumber: commonBlock,
      }),
      primary.readContract({
        address: PERMIT2,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [wallet, erc20, ROUTER],
        blockNumber: commonBlock,
      }),
    ]);

    allowance = {
      tokenToPermit2Allowance: tokenAllowance.toString(),
      permit2Allowance: permitAllowance[0].toString(),
      permit2Expiration: Number(permitAllowance[1]),
      required: amountIn.toString(),
      satisfied: tokenAllowance >= amountIn && permitAllowance[0] >= amountIn && permitAllowance[1] > nowSeconds,
    };

    if (tokenAllowance < amountIn) {
      return {
        ...baseResult,
        status: "failed",
        allowance,
        reason: `${otherAsset.symbol} allowance to Permit2 is insufficient.`,
      };
    }

    if (permitAllowance[0] < amountIn || permitAllowance[1] <= nowSeconds) {
      return {
        ...baseResult,
        status: "failed",
        allowance,
        reason: "Permit2 allowance is insufficient or expired.",
      };
    }
  }

  const deadline = nowSeconds + 120n;

  const tx = buildUniversalRouterV4Swap({
    zeroForOne,
    amountIn,
    minOut,
    deadline,
    nowSeconds,
    poolKey: venue.poolKey,
  });

  let estimatedGas: bigint;

  try {
    estimatedGas = await primary.estimateGas({
      account: wallet,
      to: ROUTER,
      data: tx.data,
      value: tx.value,
      blockNumber: commonBlock,
    });
  } catch {
    return { ...baseResult, status: "failed", reason: "Router gas estimation failed." };
  }

  if (estimatedGas <= 0n || gasPrice <= 0n) {
    return {
      ...baseResult,
      status: "failed",
      estimatedGas: estimatedGas.toString(),
      reason: "Invalid Router gas estimate or gas price.",
    };
  }

  const gasCostWithBuffer = ((estimatedGas * gasPrice) * 120n + 99n) / 100n;
  const requiredNativeBalance = zeroForOne ? amountIn + gasCostWithBuffer : gasCostWithBuffer;

  if (nativeBalance < requiredNativeBalance) {
    return {
      ...baseResult,
      status: "failed",
      estimatedGas: estimatedGas.toString(),
      reason: "Insufficient ETH balance for swap amount and gas buffer.",
    };
  }

  try {
    await primary.call({
      account: wallet,
      to: ROUTER,
      data: tx.data,
      value: tx.value,
      blockNumber: commonBlock,
    });

    return {
      ...baseResult,
      status: "passed",
      estimatedGas: estimatedGas.toString(),
      allowance,
      transaction: {
        to: ROUTER,
        data: tx.data,
        value: tx.value.toString(),
        deadline: deadline.toString(),
      },
    };
  } catch (error) {
    console.error(
      "Router transaction simulation reverted:",
      error instanceof Error ? error.message : error,
    );

    return {
      ...baseResult,
      status: "failed",
      estimatedGas: estimatedGas.toString(),
      reason: "Router transaction simulation reverted.",
    };
  }
}
