
import {
  encodeAbiParameters,
  encodeFunctionData,
} from "viem";

// Uniswap publishes this UniversalRouter for Robinhood Chain (v2.1.1) and it is
// the router observed submitting v4 swaps on-chain. See docs/ROUTING_TRUTH_TABLE.md.
export const ROUTER = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const ZERO = "0x0000000000000000000000000000000000000000";

export const BPS = 10_000n;

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
];

export const poolKey = {
  currency0: ZERO,
  currency1: USDG,
  fee: 500,
  tickSpacing: 10,
  hooks: ZERO,
};

const exactInputSingleType = {
  type: "tuple",
  components: [
    {
      name: "poolKey",
      type: "tuple",
      components: poolKeyComponents,
    },
    { name: "zeroForOne", type: "bool" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
    { name: "minHopPriceX36", type: "uint256" },
    { name: "hookData", type: "bytes" },
  ],
};

const routerAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
];

export function calculateMinOut(expectedOut, slippageBps = 50n) {
  const output = BigInt(expectedOut);
  const slippage = BigInt(slippageBps);

  if (output <= 0n) {
    throw new Error("Expected output must be positive.");
  }

  if (slippage < 0n || slippage >= BPS) {
    throw new Error("Slippage must be between 0 and 9999 bps.");
  }

  const minOut = (output * (BPS - slippage)) / BPS;

  if (minOut <= 0n) {
    throw new Error("Minimum output must be positive.");
  }

  return minOut;
}

export function buildUniversalRouterV4Swap({
  zeroForOne,
  amountIn,
  minOut,
  deadline,
  nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
  poolKey: poolKeyOverride,
}) {
  const key = poolKeyOverride ?? poolKey;
  if (typeof zeroForOne !== "boolean") {
    throw new Error("zeroForOne must be boolean.");
  }

  const expiry = BigInt(deadline);
  const now = BigInt(nowSeconds);

  if (expiry <= now) {
    throw new Error("deadline must be in the future.");
  }

  const input = BigInt(amountIn);
  const minimumOutput = BigInt(minOut);

  if (input <= 0n || input >= 2n ** 128n) {
    throw new Error("amountIn must fit uint128 and be positive.");
  }

  if (minimumOutput <= 0n || minimumOutput >= 2n ** 128n) {
    throw new Error("minOut must fit uint128 and be positive.");
  }

  // The settled/taken currency is whichever token the pool pairs with native ETH.
  // It comes from the pool key so a deployment on another chain (or another token)
  // encodes the right addresses; the mainnet constant stays the default.
  const currency1 = key.currency1 ?? USDG;
  if (key.currency0 !== ZERO) {
    throw new Error("native-ETH swaps require currency0 to be the zero address.");
  }

  const currencyIn = zeroForOne ? ZERO : currency1;
  const currencyOut = zeroForOne ? currency1 : ZERO;

  const swapParams = encodeAbiParameters(
    [exactInputSingleType],
    [
      {
        poolKey: key,
        zeroForOne,
        amountIn: input,
        amountOutMinimum: minimumOutput,
        minHopPriceX36: 0n,
        hookData: "0x",
      },
    ],
  );

  const settleParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyIn, input],
  );

  const takeParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyOut, minimumOutput],
  );

  const actions = "0x060c0f";

  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swapParams, settleParams, takeParams]],
  );

  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: ["0x10", [v4Input], expiry],
  });

  return {
    data,
    value: zeroForOne ? input : 0n,
    deadline: expiry,
  };
}
