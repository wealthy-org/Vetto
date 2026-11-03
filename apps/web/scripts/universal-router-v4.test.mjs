
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
  const tx = buildUniversalRouterV4Swap({
    zeroForOne: true,
    amountIn: 10n ** 16n,
    minOut: 20_000_000n,
    deadline: 2_000_000_000n,
  });

  const result = decodeSwap(tx);

  assert.equal(result.decoded.args[0], "0x10");
  assert.equal(result.actions, "0x060c0f");
  assert.equal(result.swap.zeroForOne, true);
  assert.equal(result.swap.amountIn, 10n ** 16n);
  assert.equal(result.swap.amountOutMinimum, 20_000_000n);
  assert.equal(result.swap.minHopPriceX36, 0n);
  assert.equal(result.swap.hookData, "0x");
  assert.equal(tx.value, 10n ** 16n);
  assert.equal(result.decoded.args[2], 2_000_000_000n);
});

test("encodes USDG to ETH with correct settlement and output currencies", () => {
  const tx = buildUniversalRouterV4Swap({
    zeroForOne: false,
    amountIn: 20_000_000n,
    minOut: 8_000_000_000_000_000n,
    deadline: 2_000_000_000n,
  });

  const result = decodeSwap(tx);

  assert.equal(result.actions, "0x060c0f");
  assert.equal(result.swap.zeroForOne, false);
  assert.equal(result.swap.amountIn, 20_000_000n);
  assert.equal(result.settle[0], USDG);
  assert.equal(result.settle[1], 20_000_000n);
  assert.equal(result.take[0], ZERO);
  assert.equal(result.take[1], 8_000_000_000_000_000n);
  assert.equal(tx.value, 0n);
});

test("rejects invalid amount, minimum output, and deadline", () => {
  const base = {
    zeroForOne: true,
    amountIn: 100n,
    minOut: 90n,
    deadline: 2_000_000_000n,
  };

  assert.throws(
    () => buildUniversalRouterV4Swap({ ...base, amountIn: 0n }),
    /amountIn/,
  );

  assert.throws(
    () => buildUniversalRouterV4Swap({ ...base, minOut: 0n }),
    /minOut/,
  );

  assert.throws(
    () => buildUniversalRouterV4Swap({ ...base, deadline: 0n }),
    /deadline/,
  );
});
