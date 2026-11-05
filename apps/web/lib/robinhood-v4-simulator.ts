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
  USDG,
  V4_QUOTER_QUOTE_ABI,
  findVenue,
  rpcUrls,
} from "./robinhood-chain";

/**
 * Pre-signature simulation.
 *
 * The payload is always rebuilt on the server from the reviewed intent and a
 * registered venue — calldata never comes from the browser. Before anything is
 * offered for signature we:
 *   1. verify both RPCs are on Robinhood Chain,
 *   2. agree on a common block and compare its hash,
 *   3. compare runtime bytecode of router / quoter / Permit2 / USDG,
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
  /** Registered venue id; defaults to the 0.05% ETH/USDG pool. */
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
  const zeroForOne = tokenIn === "ETH" && tokenOut === "USDG";

  if (!zeroForOne && !(tokenIn === "USDG" && tokenOut === "ETH")) {
    throw new Error("Only ETH/USDG swaps are supported.");
  }

  const venue = input.venueId ? findVenue(input.venueId) : POOL_VENUES[0];
  if (!venue) {
    throw new Error("Unknown trading venue.");
  }

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

  if (!primaryRpc || !secondaryRpc) {
    throw new Error("Primary RPC, secondary RPC, or verified USDG configuration is missing.");
  }

  const primaryUrl = validateRpcUrl(primaryRpc, "Primary");
  const secondaryUrl = validateRpcUrl(secondaryRpc, "Secondary");

  if (primaryUrl.origin === secondaryUrl.origin) {
    throw new Error("Primary and secondary RPC must use different origins.");
  }

  const nowMs = dependencies.now?.() ?? Date.now();
  const nowSeconds = BigInt(Math.floor(nowMs / 1000));

  const createClient =
    dependencies.createClient
    ?? ((url: string) => createPublicClient({ transport: http(url, { timeout: 15_000, retryCount: 0 }) }));

  const primary = createClient(primaryRpc);
  const secondary = createClient(secondaryRpc);

  const [primaryChainId, secondaryChainId] = await Promise.all([
    primary.getChainId(),
    secondary.getChainId(),
  ]);

  if (primaryChainId !== CHAIN_ID || secondaryChainId !== CHAIN_ID) {
    throw new Error("One or both RPC providers are not on Robinhood Chain.");
  }

  const [primaryHead, secondaryHead] = await Promise.all([
    primary.getBlockNumber(),
    secondary.getBlockNumber(),
  ]);

  const commonBlock = primaryHead < secondaryHead ? primaryHead : secondaryHead;

  const [primaryBlock, secondaryBlock] = await Promise.all([
    primary.getBlock({ blockNumber: commonBlock }),
    secondary.getBlock({ blockNumber: commonBlock }),
  ]);

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
    { name: "USDG", address: USDG.address },
  ] as const;

  const [primaryCodes, secondaryCodes] = await Promise.all([
    Promise.all(watched.map((c) => primary.getBytecode({ address: c.address, blockNumber: commonBlock }))),
    Promise.all(watched.map((c) => secondary.getBytecode({ address: c.address, blockNumber: commonBlock }))),
  ]);

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

  const [primaryQuoteCall, secondaryQuoteCall] = await Promise.all([
    primary.call({ to: QUOTER, data: quoteData, blockNumber: commonBlock }),
    secondary.call({ to: QUOTER, data: quoteData, blockNumber: commonBlock }),
  ]);

  const primaryQuote = decodeQuote(primaryQuoteCall.data);
  const secondaryQuote = decodeQuote(secondaryQuoteCall.data);

  if (
    primaryQuote.expectedOut !== secondaryQuote.expectedOut
    || primaryQuote.gasEstimate !== secondaryQuote.gasEstimate
  ) {
    throw new Error("RPC quote mismatch. Simulation stopped for safety.");
  }

  const expectedOut = primaryQuote.expectedOut;
  const minOut = (expectedOut * BigInt(10_000 - input.slippageBps)) / 10_000n;

  const [gasPrice, nativeBalance, tokenBalance] = await Promise.all([
    primary.getGasPrice(),
    primary.getBalance({ address: wallet, blockNumber: commonBlock }),
    zeroForOne
      ? Promise.resolve(0n)
      : primary.readContract({
          address: USDG.address,
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
    amountInBaseUnits: amountIn.toString(),
    expectedOutBaseUnits: expectedOut.toString(),
    minOutBaseUnits: minOut.toString(),
    gasPriceWei: gasPrice.toString(),
    quoteBlockNumber: commonBlock.toString(),
    quoteBlockHash: primaryBlock.hash,
    broadcast: false as const,
  };

  // The reviewed minimum must still be reachable with the fresh quote.
  if (reviewedMinOut !== null && minOut < reviewedMinOut) {
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
        address: USDG.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [wallet, PERMIT2],
        blockNumber: commonBlock,
      }),
      primary.readContract({
        address: PERMIT2,
        abi: PERMIT2_ABI,
        functionName: "allowance",
        args: [wallet, USDG.address, ROUTER],
        blockNumber: commonBlock,
      }),
    ]);

    allowance = {
      tokenToPermit2Allowance: tokenAllowance.toString(),
      permit2Allowance: permitAllowance[0].toString(),
      required: amountIn.toString(),
      satisfied: tokenAllowance >= amountIn && permitAllowance[0] >= amountIn && permitAllowance[1] > nowSeconds,
    };

    if (tokenAllowance < amountIn) {
      return {
        ...baseResult,
        status: "failed",
        allowance,
        reason: "USDG allowance to Permit2 is insufficient.",
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
