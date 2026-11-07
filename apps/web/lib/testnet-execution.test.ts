import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionResult, getAddress } from "viem";

/**
 * A testnet deployment has one RPC operator and its own tokens, so the simulator
 * must (a) resolve the ERC-20 leg from the chain profile instead of hardcoding
 * USDG, and (b) run single-provider instead of demanding a second endpoint, while
 * saying out loud that nothing was cross-checked.
 *
 * The profile is read at module load, so the env is set before the dynamic import.
 */
process.env.VETTO_CHAIN_PROFILE = "testnet";
process.env.NEXT_PUBLIC_VETTO_CHAIN_PROFILE = "testnet";

const HUNT = getAddress("0x348be142c0f4ac4b90b91c02aaeef9f3d246c737");
const QUOTER = getAddress("0x4E474422826915f36597348CC183330EdD9EEF31");

const NOW_MS = 1_700_000_000_000;

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
  result: [488631024787822596585557n, 130113n],
});

function singleProvider() {
  // One client object, returned every time: the simulator asks for one client on a
  // chain with a single provider, and a test may want to override a method.
  const client = {
      getChainId: async () => 46630,
      getBlockNumber: async () => 100n,
      getBlock: async () => ({ hash: `0x${"22".repeat(32)}` }),
      getBytecode: async () => "0x6000",
      getGasPrice: async () => 2n,
      getBalance: async () => 10n ** 18n,
      readContract: async () => 0n,
      call: async ({ to }: { to?: string }) =>
        to?.toLowerCase() === QUOTER.toLowerCase() ? { data: quoteData } : { data: "0x" },
      estimateGas: async () => 130_113n,
  };

  return { now: () => NOW_MS, createClient: () => client, client };
}

test("test tokens stay 'unverified' but are cleared for execution", async () => {
  const { executableSymbols, findAsset, isExecutableAsset } = await import("@vetto/asset-registry");

  const hunt = findAsset("HUNT");
  assert.equal(hunt?.status, "unverified"); // identity is not verified; the UI must keep saying so
  assert.equal(isExecutableAsset(hunt), true); // …but the swap path accepts it
  assert.deepEqual(executableSymbols(), ["ETH", "HUNT", "DUCKCOIN"]);
  assert.equal(isExecutableAsset(findAsset("USDG")), false);
});

test("testnet simulation resolves the token from the chain profile", async () => {
  const { simulateRobinhoodV4Swap } = await import("./robinhood-v4-simulator.ts");

  const result = await simulateRobinhoodV4Swap(
    { wallet: "0x0000000000000000000000000000000000000001", tokenIn: "ETH", tokenOut: "HUNT", amountInBaseUnits: "10000000000000000", slippageBps: 50 },
    singleProvider() as never,
  );

  assert.equal(result.status, "passed", result.reason);
  assert.equal(result.chainId, 46630);
  assert.equal(result.venueId, "tn-v4-eth-hunt");
  assert.equal(result.expectedOutBaseUnits, "488631024787822596585557");
  // One operator on this chain: the result must not claim a cross-check.
  assert.equal(result.crossChecked, false);
  assert.equal(result.transaction?.value, "10000000000000000");
});

test("testnet simulation refuses a symbol the profile does not pair with ETH", async () => {
  const { simulateRobinhoodV4Swap } = await import("./robinhood-v4-simulator.ts");

  await assert.rejects(
    () =>
      simulateRobinhoodV4Swap(
        { wallet: "0x0000000000000000000000000000000000000001", tokenIn: "ETH", tokenOut: "USDG", amountInBaseUnits: "1000", slippageBps: 50 },
        singleProvider() as never,
      ),
    /Only ETH\/HUNT swaps are supported/,
  );
});

test("testnet simulation refuses a venue that pairs a different token", async () => {
  const { simulateRobinhoodV4Swap } = await import("./robinhood-v4-simulator.ts");

  await assert.rejects(
    () =>
      simulateRobinhoodV4Swap(
        { wallet: "0x0000000000000000000000000000000000000001", tokenIn: "ETH", tokenOut: "HUNT", amountInBaseUnits: "1000", slippageBps: 50, venueId: "tn-v4-eth-duckcoin" },
        singleProvider() as never,
      ),
    /does not pair this token with ETH/,
  );
});

test("the HUNT leg is the one whose bytecode is compared", async () => {
  const { simulateRobinhoodV4Swap } = await import("./robinhood-v4-simulator.ts");

  const seen: string[] = [];
  const deps = singleProvider();
  (deps.client as Record<string, unknown>).getBytecode = async ({ address }: { address: string }) => {
    seen.push(address.toLowerCase());
    return address.toLowerCase() === HUNT.toLowerCase() ? "0x" : "0x6000";
  };

  await assert.rejects(
    () =>
      simulateRobinhoodV4Swap(
        { wallet: "0x0000000000000000000000000000000000000001", tokenIn: "ETH", tokenOut: "HUNT", amountInBaseUnits: "1000", slippageBps: 50 },
        deps as never,
      ),
    /HUNT bytecode is unavailable/,
  );
  assert.ok(seen.includes(HUNT.toLowerCase()));
});
