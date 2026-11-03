import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  http,
  type Address,
} from "viem";

import {
  buildUniversalRouterV4Swap,
} from "../scripts/universal-router-v4.mjs";

const CHAIN_ID = 4663;
const ROUTER = getAddress("0x204FAca1764B154221e35c0d20aBb3c525710498");
const QUOTER = getAddress("0x8dc178efb8111bb0973dd9d722ebeFF267c98f94");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as Address;

const erc20Abi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "owner", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const allowanceAbi = [{
  type: "function",
  name: "allowance",
  stateMutability: "view",
  inputs: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
  ],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const permit2Abi = [{
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
}] as const;

const quoterAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
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
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "gasEstimate", type: "uint256" },
  ],
}] as const;

export interface SimulationInput {
  wallet: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  slippageBps: number;
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
  expectedOutBaseUnits?: string;
  minOutBaseUnits?: string;
  estimatedGas?: string;
  quoteBlockNumber?: string;
  quoteBlockHash?: string;
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
    && !(url.protocol === "http:" && [
      "localhost",
      "127.0.0.1",
      "[::1]",
    ].includes(url.hostname))
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
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    data,
  });

  if (result[0] <= 0n || result[1] <= 0n) {
    throw new Error("Quoter returned an invalid result.");
  }

  return {
    expectedOut: result[0],
    gasEstimate: result[1],
  };
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

  if (
    !Number.isInteger(input.slippageBps)
    || input.slippageBps < 0
    || input.slippageBps >= 10000
  ) {
    throw new Error("Invalid slippage.");
  }

  const tokenIn = input.tokenIn.toUpperCase();
  const tokenOut = input.tokenOut.toUpperCase();

  const zeroForOne =
    tokenIn === "ETH" && tokenOut === "USDG";

  if (
    !zeroForOne
    && !(tokenIn === "USDG" && tokenOut === "ETH")
  ) {
    throw new Error("Only ETH/USDG swaps are supported.");
  }

  const primaryRpc = process.env.ROBINHOOD_RPC_URL_PRIMARY;
  const secondaryRpc = process.env.ROBINHOOD_RPC_URL_SECONDARY;
  const configuredUsdg = process.env.ROBINHOOD_USDG_ADDRESS;

  if (!primaryRpc || !secondaryRpc || !configuredUsdg) {
    throw new Error(
      "Primary RPC, secondary RPC, or verified USDG configuration is missing.",
    );
  }

  if (getAddress(configuredUsdg) !== USDG) {
    throw new Error("Configured USDG address does not match verified USDG.");
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
    ?? ((url: string) =>
      createPublicClient({
        transport: http(url, {
          timeout: 15000,
          retryCount: 0,
        }),
      }));

  const primary = createClient(primaryRpc);
  const secondary = createClient(secondaryRpc);

  const [primaryChainId, secondaryChainId] = await Promise.all([
    primary.getChainId(),
    secondary.getChainId(),
  ]);

  if (
    primaryChainId !== CHAIN_ID
    || secondaryChainId !== CHAIN_ID
  ) {
    throw new Error("One or both RPC providers are not on Robinhood Chain.");
  }

  const [primaryHead, secondaryHead] = await Promise.all([
    primary.getBlockNumber(),
    secondary.getBlockNumber(),
  ]);

  const commonBlock = primaryHead < secondaryHead
    ? primaryHead
    : secondaryHead;

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

  const [primaryCodes, secondaryCodes] = await Promise.all([
    Promise.all([
      primary.getBytecode({ address: ROUTER, blockNumber: commonBlock }),
      primary.getBytecode({ address: QUOTER, blockNumber: commonBlock }),
      primary.getBytecode({ address: PERMIT2, blockNumber: commonBlock }),
      primary.getBytecode({ address: USDG, blockNumber: commonBlock }),
    ]),
    Promise.all([
      secondary.getBytecode({ address: ROUTER, blockNumber: commonBlock }),
      secondary.getBytecode({ address: QUOTER, blockNumber: commonBlock }),
      secondary.getBytecode({ address: PERMIT2, blockNumber: commonBlock }),
      secondary.getBytecode({ address: USDG, blockNumber: commonBlock }),
    ]),
  ]);

  const contractNames = ["Router", "Quoter", "Permit2", "USDG"];

  for (let index = 0; index < contractNames.length; index += 1) {
    const primaryCode = primaryCodes[index];
    const secondaryCode = secondaryCodes[index];

    if (
      !primaryCode || primaryCode === "0x"
      || !secondaryCode || secondaryCode === "0x"
    ) {
      throw new Error(`${contractNames[index]} bytecode is unavailable.`);
    }

    if (primaryCode.toLowerCase() !== secondaryCode.toLowerCase()) {
      throw new Error(`${contractNames[index]} bytecode mismatch between RPCs.`);
    }
  }

  const poolKey = {
    currency0: ZERO_ADDRESS,
    currency1: USDG,
    fee: 500,
    tickSpacing: 10,
    hooks: ZERO_ADDRESS,
  };

  const quoteData = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{
      poolKey,
      zeroForOne,
      exactAmount: amountIn,
      hookData: "0x",
    }],
  });

  const [primaryQuoteCall, secondaryQuoteCall] = await Promise.all([
    primary.call({
      to: QUOTER,
      data: quoteData,
      blockNumber: commonBlock,
    }),
    secondary.call({
      to: QUOTER,
      data: quoteData,
      blockNumber: commonBlock,
    }),
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
  const minOut =
    expectedOut * BigInt(10000 - input.slippageBps) / 10000n;

  const [gasPrice, nativeBalance, tokenBalance] = await Promise.all([
    primary.getGasPrice(),
    primary.getBalance({
      address: wallet,
      blockNumber: commonBlock,
    }),
    zeroForOne
      ? Promise.resolve(0n)
      : primary.readContract({
          address: USDG,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
          blockNumber: commonBlock,
        }),
  ]);

  const inputBalance = zeroForOne
    ? nativeBalance
    : tokenBalance;

  const baseResult = {
    chainId: CHAIN_ID,
    wallet,
    tokenIn,
    tokenOut,
    amountInBaseUnits: amountIn.toString(),
    expectedOutBaseUnits: expectedOut.toString(),
    minOutBaseUnits: minOut.toString(),
    quoteBlockNumber: commonBlock.toString(),
    quoteBlockHash: primaryBlock.hash,
    broadcast: false as const,
  };

  if (inputBalance < amountIn) {
    return {
      ...baseResult,
      status: "failed",
      reason: "Insufficient input-token balance.",
    };
  }

  if (!zeroForOne) {
    const [tokenAllowance, permitAllowance] = await Promise.all([
      primary.readContract({
        address: USDG,
        abi: allowanceAbi,
        functionName: "allowance",
        args: [wallet, PERMIT2],
        blockNumber: commonBlock,
      }),
      primary.readContract({
        address: PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [wallet, USDG, ROUTER],
        blockNumber: commonBlock,
      }),
    ]);

    if (tokenAllowance < amountIn) {
      return {
        ...baseResult,
        status: "failed",
        reason: "USDG allowance to Permit2 is insufficient.",
      };
    }

    if (
      permitAllowance[0] < amountIn
      || permitAllowance[1] <= nowSeconds
    ) {
      return {
        ...baseResult,
        status: "failed",
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
    return {
      ...baseResult,
      status: "failed",
      reason: "Router gas estimation failed.",
    };
  }

  if (estimatedGas <= 0n || gasPrice <= 0n) {
    return {
      ...baseResult,
      status: "failed",
      estimatedGas: estimatedGas.toString(),
      reason: "Invalid Router gas estimate or gas price.",
    };
  }

  const gasCost = estimatedGas * gasPrice;
  const gasCostWithBuffer = (gasCost * 120n + 99n) / 100n;

  const requiredNativeBalance = zeroForOne
    ? amountIn + gasCostWithBuffer
    : gasCostWithBuffer;

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
    };
  } catch {
    return {
      ...baseResult,
      status: "failed",
      estimatedGas: estimatedGas.toString(),
      reason: "Router eth_call simulation reverted.",
    };
  }
}