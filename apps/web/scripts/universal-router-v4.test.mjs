
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeAbiParameters,
  decodeFunctionData,
} from "viem";

import {
  ZERO,
  USDG,
  poolKey,
  calculateMinOut,
  buildUniversalRouterV4Swap,
} from "./universal-router-v4.mjs";

const TEST_NOW = 1_900_000_000n;
const FUTURE_DEADLINE = 2_000_000_000n;

const EXACT_INPUT_SINGLE_TYPE = {
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
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
    { name: "minHopPriceX36", type: "uint256" },
    { name: "hookData", type: "bytes" },
  ],
};

const ROUTER_ABI = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}];

function decodeSwap(tx) {
  const decoded = decodeFunctionData({
    abi: ROUTER_ABI,
    data: tx.data,
  });

  const [actions, params] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    decoded.args[1][0],
  );

  const [swap] = decodeAbiParameters(
    [EXACT_INPUT_SINGLE_TYPE],
    params[0],
  );

  return {
    decoded,
    actions,
    swap,
    settle: decodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      params[1],
    ),
    take: decodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      params[2],
    ),
  };
}

test("uses verified ETH/USDG pool configuration", () => {
  assert.equal(poolKey.currency0, ZERO);
  assert.equal(poolKey.currency1, USDG);
  assert.equal(poolKey.fee, 500);
  assert.equal(poolKey.tickSpacing, 10);
  assert.equal(poolKey.hooks, ZERO);
});

test("calculates minimum output with 50 bps slippage", () => {
  assert.equal(calculateMinOut(100_000n, 50n), 99_500n);
});

test("rejects invalid slippage and output values", () => {
  assert.throws(() => calculateMinOut(0n), /positive/);
  assert.throws(() => calculateMinOut(100n, 10_000n), /slippage/i);
  assert.throws(() => calculateMinOut(100n, -1n), /slippage/i);
});

test("encodes ETH to USDG with correct router commands and actions", () => {
  const amountIn = 10n ** 16n;
  const minOut = 20_000_000n;

  const tx = buildUniversalRouterV4Swap({
    zeroForOne: true,
    amountIn,
    minOut,
    deadline: FUTURE_DEADLINE,
    nowSeconds: TEST_NOW,
  });

  const result = decodeSwap(tx);

  assert.equal(result.decoded.args[0], "0x10");
  assert.equal(result.actions, "0x060c0f");

  assert.equal(result.swap.poolKey.currency0, ZERO);
  assert.equal(result.swap.poolKey.currency1, USDG);
  assert.equal(result.swap.poolKey.fee, 500);
  assert.equal(result.swap.poolKey.tickSpacing, 10);
  assert.equal(result.swap.poolKey.hooks, ZERO);

  assert.equal(result.swap.zeroForOne, true);
  assert.equal(result.swap.amountIn, amountIn);
  assert.equal(result.swap.amountOutMinimum, minOut);

  assert.equal(result.settle[0], ZERO);
  assert.equal(result.settle[1], amountIn);

  assert.equal(result.take[0], USDG);
  assert.equal(result.take[1], minOut);

  assert.equal(result.swap.minHopPriceX36, 0n);
  assert.equal(result.swap.hookData, "0x");

  assert.equal(tx.value, amountIn);
  assert.equal(result.decoded.args[2], FUTURE_DEADLINE);
});

test("encodes USDG to ETH with correct settlement and output currencies", () => {
  const amountIn = 20_000_000n;
  const minOut = 8_000_000_000_000_000n;

  const tx = buildUniversalRouterV4Swap({
    zeroForOne: false,
    amountIn,
    minOut,
    deadline: FUTURE_DEADLINE,
    nowSeconds: TEST_NOW,
  });

  const result = decodeSwap(tx);

  assert.equal(result.decoded.args[0], "0x10");
  assert.equal(result.actions, "0x060c0f");

  assert.equal(result.swap.poolKey.currency0, ZERO);
  assert.equal(result.swap.poolKey.currency1, USDG);
  assert.equal(result.swap.poolKey.fee, 500);
  assert.equal(result.swap.poolKey.tickSpacing, 10);
  assert.equal(result.swap.poolKey.hooks, ZERO);

  assert.equal(result.swap.zeroForOne, false);
  assert.equal(result.swap.amountIn, amountIn);
  assert.equal(result.swap.amountOutMinimum, minOut);

  assert.equal(result.settle[0], USDG);
  assert.equal(result.settle[1], amountIn);

  assert.equal(result.take[0], ZERO);
  assert.equal(result.take[1], minOut);

  assert.equal(tx.value, 0n);
  assert.equal(result.decoded.args[2], FUTURE_DEADLINE);
});

test("rejects invalid amount and minimum output", () => {
  const base = {
    zeroForOne: true,
    amountIn: 100n,
    minOut: 90n,
    deadline: FUTURE_DEADLINE,
    nowSeconds: TEST_NOW,
  };

  assert.throws(
    () => buildUniversalRouterV4Swap({
      ...base,
      amountIn: 0n,
    }),
    /amountIn/,
  );

  assert.throws(
    () => buildUniversalRouterV4Swap({
      ...base,
      minOut: 0n,
    }),
    /minOut/,
  );
});

test("rejects zero and expired deadlines", () => {
  const base = {
    zeroForOne: true,
    amountIn: 100n,
    minOut: 90n,
    nowSeconds: TEST_NOW,
  };

  assert.throws(
    () => buildUniversalRouterV4Swap({
      ...base,
      deadline: 0n,
    }),
    /deadline/i,
  );

  assert.throws(
    () => buildUniversalRouterV4Swap({
      ...base,
      deadline: TEST_NOW,
    }),
    /deadline/i,
  );

  assert.throws(
    () => buildUniversalRouterV4Swap({
      ...base,
      deadline: TEST_NOW - 1n,
    }),
    /deadline/i,
  );
});

test("accepts a future deadline with deterministic time", () => {
  const tx = buildUniversalRouterV4Swap({
    zeroForOne: true,
    amountIn: 100n,
    minOut: 90n,
    deadline: TEST_NOW + 120n,
    nowSeconds: TEST_NOW,
  });

  const decoded = decodeFunctionData({
    abi: ROUTER_ABI,
    data: tx.data,
  });

  assert.equal(decoded.args[2], TEST_NOW + 120n);
});
