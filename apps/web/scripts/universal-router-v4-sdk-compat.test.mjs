import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData } from "viem";

import { buildUniversalRouterV4Swap } from "./universal-router-v4.mjs";

const require = createRequire(import.meta.url);

const { V4Planner, Actions, URVersion } = require("@uniswap/v4-sdk");
const {
  RoutePlanner,
  CommandType,
  UniversalRouterVersion,
} = require("@uniswap/universal-router-sdk");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const TEST_NOW = 1_900_000_000n;
const DEADLINE = 2_000_000_000n;
const AMOUNT_IN = 123456789n;
const MIN_OUT = 98765n;

const POOL_KEY = {
  currency0: ZERO_ADDRESS,
  currency1: USDG_ADDRESS,
  fee: 500,
  tickSpacing: 10,
  hooks: ZERO_ADDRESS,
};

const EXECUTE_ABI = [
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

function buildSdkCalldata(zeroForOne) {
  const inputCurrency = zeroForOne ? ZERO_ADDRESS : USDG_ADDRESS;
  const outputCurrency = zeroForOne ? USDG_ADDRESS : ZERO_ADDRESS;

  const v4Planner = new V4Planner();

  v4Planner.addAction(
    Actions.SWAP_EXACT_IN_SINGLE,
    [
      {
        poolKey: POOL_KEY,
        zeroForOne,
        amountIn: AMOUNT_IN.toString(),
        amountOutMinimum: MIN_OUT.toString(),
        minHopPriceX36: "0",
        hookData: "0x",
      },
    ],
    URVersion.V2_1_1,
  );

  v4Planner.addAction(
    Actions.SETTLE_ALL,
    [inputCurrency, AMOUNT_IN.toString()],
    URVersion.V2_1_1,
  );

  v4Planner.addAction(
    Actions.TAKE_ALL,
    [outputCurrency, MIN_OUT.toString()],
    URVersion.V2_1_1,
  );

  const routePlanner = new RoutePlanner();

  routePlanner.addCommand(
    CommandType.V4_SWAP,
    [v4Planner.finalize()],
    false,
    UniversalRouterVersion.V2_1_2,
  );

  const calldata = encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: "execute",
    args: [
      routePlanner.commands,
      routePlanner.inputs,
      DEADLINE,
    ],
  });

  return {
    calldata,
    commands: routePlanner.commands,
    actions: v4Planner.actions,
  };
}

for (const scenario of [
  {
    name: "ETH -> USDG",
    zeroForOne: true,
    expectedValue: AMOUNT_IN,
  },
  {
    name: "USDG -> ETH",
    zeroForOne: false,
    expectedValue: 0n,
  },
]) {
  test(`SDK compatibility: ${scenario.name}`, () => {
    const sdk = buildSdkCalldata(scenario.zeroForOne);

    const local = buildUniversalRouterV4Swap({
      zeroForOne: scenario.zeroForOne,
      amountIn: AMOUNT_IN,
      minOut: MIN_OUT,
      deadline: DEADLINE,
      nowSeconds: TEST_NOW,
    });

    assert.equal(sdk.commands, "0x10");
    assert.equal(sdk.actions, "0x060c0f");

    assert.equal(
      local.data.toLowerCase(),
      sdk.calldata.toLowerCase(),
      "VETTO calldata must match official Uniswap SDK calldata",
    );

    assert.equal(local.value, scenario.expectedValue);
    assert.equal(local.deadline, DEADLINE);
  });
}
