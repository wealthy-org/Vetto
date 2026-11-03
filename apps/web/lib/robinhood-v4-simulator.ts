
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
): Promise<SimulationResult> {
  const wallet = getAddress(input.wallet);

  if (!/^\d+$/.test(input.amountInBaseUnits)) {
    throw new Error("Invalid input amount.");
  }

  const amountIn = BigInt(input.amountInBaseUnits);
  if (amountIn <= 0n || amountIn >= 2n ** 128n) {
    throw new Error("Input amount is outside uint128 bounds.");
  }

  if (!Number.isInteger(input.slippageBps)
    || input.slippageBps < 0
    || input.slippageBps >= 10000) {
    throw new Error("Invalid slippage.");
  }

  const tokenIn = input.tokenIn.toUpperCase();
  const tokenOut = input.tokenOut.toUpperCase();

  const zeroForOne =
    tokenIn === "ETH" && tokenOut === "USDG";

  if (!zeroForOne && !(tokenIn === "USDG" && tokenOut === "ETH")) {
    throw new Error("Only ETH/USDG swaps are supported.");
  }

  const rpc = process.env.ROBINHOOD_RPC_URL_PRIMARY;
  const configuredUsdg = process.env.ROBINHOOD_USDG_ADDRESS;

  if (!rpc || !configuredUsdg || getAddress(configuredUsdg) !== USDG) {
    throw new Error("Robinhood RPC or verified USDG configuration is missing.");
  }

  const client = createPublicClient({
    transport: http(rpc, { timeout: 15000, retryCount: 0 }),
  });

  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) {
    throw new Error("RPC is not connected to Robinhood Chain.");
  }

  const [routerCode, quoterCode, permit2Code] = await Promise.all([
    client.getBytecode({ address: ROUTER }),
    client.getBytecode({ address: QUOTER }),
    client.getBytecode({ address: PERMIT2 }),
  ]);

  if (!routerCode || routerCode === "0x"
    || !quoterCode || quoterCode === "0x"
    || !permit2Code || permit2Code === "0x") {
    throw new Error("Required router, quoter, or Permit2 contract is unavailable.");
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

const [quoteCall, gasPrice, inputBalance] = await Promise.all([
  client.call({
    to: QUOTER,
    data: quoteData,
  }),
    client.getGasPrice(),
    zeroForOne
      ? client.getBalance({ address: wallet })
      : client.readContract({
          address: USDG,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [wallet],
        }),
  ]);

  if (!quoteCall.data) {
    throw new Error("Quoter returned empty data.");
    }

    const quote = decodeFunctionResult({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    data: quoteCall.data,
    });

    const expectedOut = quote[0];
    const quoterGas = quote[1];

  if (expectedOut <= 0n || quoterGas <= 0n) {
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
        status: "failed", chainId, wallet, tokenIn, tokenOut,
        amountInBaseUnits: amountIn.toString(),
        expectedOutBaseUnits: expectedOut.toString(),
        minOutBaseUnits: minOut.toString(),
        reason: "USDG allowance to Permit2 is insufficient.",
        broadcast: false,
      };
    }

    if (permitAllowance[0] < amountIn
      || permitAllowance[1] <= BigInt(Math.floor(Date.now() / 1000))) {
      return {
        status: "failed", chainId, wallet, tokenIn, tokenOut,
        amountInBaseUnits: amountIn.toString(),
        expectedOutBaseUnits: expectedOut.toString(),
        minOutBaseUnits: minOut.toString(),
        reason: "Permit2 allowance is insufficient or expired.",
        broadcast: false,
      };
    }
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000)) + 120n;

  const tx = buildUniversalRouterV4Swap({
    zeroForOne,
    amountIn,
    minOut,
    deadline,
  });

  const gasCost = quoterGas * gasPrice;

  try {
    const simulation = await client.call({
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
      estimatedGas: quoterGas.toString(),
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
      estimatedGas: quoterGas.toString(),
      reason: "Router eth_call simulation reverted.",
      broadcast: false,
    };
  }
}
