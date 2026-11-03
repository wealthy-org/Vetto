import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { encodeFunctionResult, getAddress } from "viem";

import {
  simulateRobinhoodV4Swap,
  type SimulationDependencies,
} from "./robinhood-v4-simulator.ts";

const ROUTER = getAddress("0x204FAca1764B154221e35c0d20aBb3c525710498");
const QUOTER = getAddress("0x8dc178efb8111bb0973dd9d722ebeff267c98f94");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");

const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = BigInt(Math.floor(NOW_MS / 1000));

const quoteAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
      ] },
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

const quoteData = encodeFunctionResult({
  abi: quoteAbi,
  functionName: "quoteExactInputSingle",
  result: [2000n, 500n],
});

const originalRpc = process.env.ROBINHOOD_RPC_URL_PRIMARY;
const originalUsdg = process.env.ROBINHOOD_USDG_ADDRESS;

beforeEach(() => {
  process.env.ROBINHOOD_RPC_URL_PRIMARY = "https://rpc.example.test";
  process.env.ROBINHOOD_USDG_ADDRESS = USDG;
});

afterEach(() => {
  if (originalRpc === undefined) {
    delete process.env.ROBINHOOD_RPC_URL_PRIMARY;
  } else {
    process.env.ROBINHOOD_RPC_URL_PRIMARY = originalRpc;
  }

  if (originalUsdg === undefined) {
    delete process.env.ROBINHOOD_USDG_ADDRESS;
  } else {
    process.env.ROBINHOOD_USDG_ADDRESS = originalUsdg;
  }
});

function makeDependencies(options: {
  nativeBalance?: bigint;
  tokenBalance?: bigint;
  tokenAllowance?: bigint;
  permitAmount?: bigint;
  permitExpiration?: bigint;
  estimatedGas?: bigint;
  estimateGasFails?: boolean;
  routerReverts?: boolean;
} = {}): SimulationDependencies {
  const client = {
    getChainId: async () => 4663,
    getBytecode: async () => "0x6000",
    getGasPrice: async () => 2n,
    getBalance: async () => options.nativeBalance ?? 100_000n,

    readContract: async ({
      address,
      functionName,
    }: {
      address: string;
      functionName: string;
    }) => {
      if (address.toLowerCase() === USDG.toLowerCase()) {
        if (functionName === "balanceOf") {
          return options.tokenBalance ?? 2_000n;
        }

        if (functionName === "allowance") {
          return options.tokenAllowance ?? 2_000n;
        }
      }

      return [
        options.permitAmount ?? 2_000n,
        options.permitExpiration ?? NOW_SECONDS + 10_000n,
        0n,
      ];
    },

    call: async ({ to }: { to?: string }) => {
      if (to?.toLowerCase() === QUOTER.toLowerCase()) {
        return { data: quoteData };
      }

      if (options.routerReverts) {
        throw new Error("Mock Router revert");
      }

      return { data: "0x" };
    },

    estimateGas: async () => {
      if (options.estimateGasFails) {
        throw new Error("Mock gas estimation failure");
      }

      return options.estimatedGas ?? 100n;
    },
  };

  return {
    now: () => NOW_MS,
    createClient: () => client as never,
  };
}

const wallet = "0x0000000000000000000000000000000000000001";

function makeInput(tokenIn: string, tokenOut: string) {
  return {
    wallet,
    tokenIn,
    tokenOut,
    amountInBaseUnits: "1000",
    slippageBps: 50,
  };
}

test("simulates ETH to USDG using Router gas estimation", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("ETH", "USDG"),
    makeDependencies(),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.estimatedGas, "100");
  assert.equal(result.expectedOutBaseUnits, "2000");
  assert.equal(result.minOutBaseUnits, "1990");
  assert.equal(result.broadcast, false);
});

test("simulates USDG to ETH with valid allowances", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("USDG", "ETH"),
    makeDependencies(),
  );

  assert.equal(result.status, "passed");
  assert.equal(result.estimatedGas, "100");
  assert.equal(result.broadcast, false);
});

test("rejects ETH swap when native balance cannot cover amount and gas buffer", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("ETH", "USDG"),
    makeDependencies({ nativeBalance: 1239n }),
  );

  assert.equal(result.status, "failed");
  assert.equal(
    result.reason,
    "Insufficient ETH balance for swap amount and gas buffer."
  );
  assert.equal(result.broadcast, false);
});

test("rejects swap when Router gas estimation fails", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("ETH", "USDG"),
    makeDependencies({ estimateGasFails: true }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "Router gas estimation failed.");
  assert.equal(result.broadcast, false);
});

test("rejects swap when Router eth_call reverts", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("ETH", "USDG"),
    makeDependencies({ routerReverts: true }),
  );

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "Router eth_call simulation reverted.");
  assert.equal(result.broadcast, false);
});

test("rejects USDG swap when native balance cannot cover gas buffer", async () => {
  const result = await simulateRobinhoodV4Swap(
    makeInput("USDG", "ETH"),
    makeDependencies({ nativeBalance: 239n }),
  );

  assert.equal(result.status, "failed");
  assert.equal(
    result.reason,
    "Insufficient ETH balance for swap amount and gas buffer.",
  );
  assert.equal(result.broadcast, false);
});