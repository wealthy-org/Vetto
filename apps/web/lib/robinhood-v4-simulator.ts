
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
const QUOTER = getAddress("0x8dc178efb8111bb0973dd9d722ebeff267c98f94");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");

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
  reason?: string;
  broadcast: false;
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

  const rpc = process.env.ROBINHOOD_RPC_URL_PRIMARY;
  const configuredUsdg = process.env.ROBINHOOD_USDG_ADDRESS;

  if (
    !rpc
    || !configuredUsdg
    || getAddress(configuredUsdg) !== USDG
  ) {
    throw new Error(
      "Robinhood RPC or verified USDG configuration is missing.",
    );
  }

  // Use the injected clock for deterministic tests.
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

  const client = createClient(rpc);

  const chainId = await client.getChainId();

  if (chainId !== CHAIN_ID) {
    throw new Error("RPC is not connected to Robinhood Chain.");
  }

  const [routerCode, quoterCode, permit2Code] = await Promise.all([
    client.getBytecode({ address: ROUTER }),
    client.getBytecode({ address: QUOTER }),
    client.getBytecode({ address: PERMIT2 }),
  ]);

  if (
    !routerCode || routerCode === "0x"
    || !quoterCode || quoterCode === "0x"
    || !permit2Code || permit2Code === "0x"
  ) {
    throw new Error(
      "Required router, quoter, or Permit2 contract is unavailable.",
    );
  }

  const poolKey = {
    currency0: "0x0000000000000000000000000000000000000000" as Address,
    currency1: USDG,
    fee: 500,
    tickSpacing: 10,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
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

  const [quoteCall, gasPrice, nativeBalance, tokenBalance] =
    await Promise.all([
      client.call({
        to: QUOTER,
        data: quoteData,
      }),
      client.getGasPrice(),
      client.getBalance({ address: wallet }),
      zeroForOne
        ? Promise.resolve(0n)
        : client.readContract({
            address: USDG,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [wallet],
          }),
    ]);

  const inputBalance = zeroForOne
    ? nativeBalance
    : tokenBalance;

  if (!quoteCall.data) {
    throw new Error("Quoter returned empty data.");
  }

  const quote = decodeFunctionResult({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    data: quoteCall.data,
  });

  const expectedOut = quote[0];

  if (expectedOut <= 0n) {
    throw new Error("Quoter returned an invalid result.");
  }

  const minOut =
    expectedOut * BigInt(10000 - input.slippageBps) / 10000n;

  if (inputBalance < amountIn) {
    return {
      status: "failed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      reason: "Insufficient input-token balance.",
      broadcast: false,
    };
  }

  if (!zeroForOne) {
    const [tokenAllowance, permitAllowance] = await Promise.all([
      client.readContract({
        address: USDG,
        abi: allowanceAbi,
        functionName: "allowance",
        args: [wallet, PERMIT2],
      }),
      client.readContract({
        address: PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [wallet, USDG, ROUTER],
      }),
    ]);

    if (tokenAllowance < amountIn) {
      return {
        status: "failed",
        chainId,
        wallet,
        tokenIn,
        tokenOut,
        amountInBaseUnits: amountIn.toString(),
        expectedOutBaseUnits: expectedOut.toString(),
        minOutBaseUnits: minOut.toString(),
        reason: "USDG allowance to Permit2 is insufficient.",
        broadcast: false,
      };
    }

    if (
      permitAllowance[0] < amountIn
      || permitAllowance[1] <= nowSeconds
    ) {
      return {
        status: "failed",
        chainId,
        wallet,
        tokenIn,
        tokenOut,
        amountInBaseUnits: amountIn.toString(),
        expectedOutBaseUnits: expectedOut.toString(),
        minOutBaseUnits: minOut.toString(),
        reason: "Permit2 allowance is insufficient or expired.",
        broadcast: false,
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
    estimatedGas = await client.estimateGas({
      account: wallet,
      to: ROUTER,
      data: tx.data,
      value: tx.value,
    });
  } catch {
    return {
      status: "failed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      reason: "Router gas estimation failed.",
      broadcast: false,
    };
  }

  if (estimatedGas <= 0n || gasPrice <= 0n) {
    return {
      status: "failed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      reason: "Invalid Router gas estimate or gas price.",
      broadcast: false,
    };
  }

  const gasCost = estimatedGas * gasPrice;
  const gasCostWithBuffer = (gasCost * 120n + 99n) / 100n;

  const requiredNativeBalance = zeroForOne
    ? amountIn + gasCostWithBuffer
    : gasCostWithBuffer;

  if (nativeBalance < requiredNativeBalance) {
    return {
      status: "failed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      estimatedGas: estimatedGas.toString(),
      reason: "Insufficient ETH balance for swap amount and gas buffer.",
      broadcast: false,
    };
  }

  try {
    await client.call({
      account: wallet,
      to: ROUTER,
      data: tx.data,
      value: tx.value,
    });

    return {
      status: "passed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      estimatedGas: estimatedGas.toString(),
      broadcast: false,
    };
  } catch {
    return {
      status: "failed",
      chainId,
      wallet,
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      estimatedGas: estimatedGas.toString(),
      reason: "Router eth_call simulation reverted.",
      broadcast: false,
    };
  }
}
