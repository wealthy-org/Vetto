import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeAbiParameters, keccak256, toBytes, toFunctionSelector } from "viem";
import {
  discoverV4Pools,
  verifyChain,
  verifyV4Pool,
  UNISWAP_V4_POOL_MANAGER,
  UNISWAP_V4_QUOTER,
  UNISWAP_V4_STATE_VIEW,
} from "./verify-chain.mjs";

const TOKEN = "0x1234567890123456789012345678901234567890";
const ENV = {
  primaryUrl: "http://127.0.0.1:8545",
  secondaryUrl: "http://localhost:8546",
  usdgAddress: TOKEN,
};

function encodedString(value) {
  const bytes = Buffer.from(value).toString("hex");
  return `0x${(32n).toString(16).padStart(64, "0")}${BigInt(bytes.length / 2).toString(16).padStart(64, "0")}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`;
}

function mockFetch({
  chainId = "0x1237",
  primaryBlock = "0x100",
  secondaryBlock = "0x102",
  mismatchedCode = false,
  mismatchedQuoterCode = false,
  quoterCode = "0x6002",
  symbol = "USDG",
  decimals = "0x6",
} = {}) {
  return async (url, init) => {
    const host = new URL(url).host;
    const providerIndex = host.endsWith("8545") ? 0 : 1;
    const { method, params } = JSON.parse(init.body);
    let result;
    switch (method) {
      case "eth_chainId":
        result = chainId;
        break;
      case "eth_blockNumber":
        result = providerIndex === 0 ? primaryBlock : secondaryBlock;
        break;
      case "eth_getCode":
        result = params[0].toLowerCase() === UNISWAP_V4_POOL_MANAGER.toLowerCase()
          ? providerIndex === 1 && mismatchedCode ? "0x6002" : "0x6001"
          : params[0].toLowerCase() === UNISWAP_V4_QUOTER.toLowerCase()
            ? providerIndex === 1 && mismatchedQuoterCode ? "0x6004" : quoterCode
            : "0x6003";
        break;
      case "eth_call":
        result = params[0].data === "0x95d89b41" ? encodedString(symbol) : decimals;
        break;
      default:
        throw new Error(`Unexpected RPC method ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
}

test("validates chain, USDG metadata, and contract bytecode at a shared block", async () => {
  const report = await verifyChain({ ...ENV, fetchImpl: mockFetch() });
  assert.equal(report.chainId, 4663);
  assert.equal(report.commonBlock, "256");
  assert.equal(report.usdg.symbol, "USDG");
  assert.equal(report.usdg.decimals, 6);
  assert.equal(report.quoter, UNISWAP_V4_QUOTER);
  assert.equal(report.providers.length, 2);
});

test("rejects an RPC on the wrong chain", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: mockFetch({ chainId: "0x1" }) }),
    /expected 4663/,
  );
});

test("rejects providers with different contract code", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: mockFetch({ mismatchedCode: true }) }),
    /disagree on contract bytecode/,
  );
});

test("requires matching deployed Quoter bytecode on both providers", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: mockFetch({ quoterCode: "0x" }) }),
    /no Uniswap v4 Quoter bytecode/,
  );
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: mockFetch({ mismatchedQuoterCode: true }) }),
    /disagree on contract bytecode/,
  );
});

test("rejects incorrect USDG token metadata", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: mockFetch({ decimals: "0x12" }) }),
    /metadata mismatch/,
  );
});

test("rejects malformed JSON-RPC response bodies", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, fetchImpl: async () => Response.json("not an object") }),
    /invalid JSON-RPC response/,
  );
});

test("includes the RPC response detail when an HTTP request fails", async () => {
  await assert.rejects(
    verifyChain({
      ...ENV,
      fetchImpl: async () => new Response("request exceeds allowed log range", { status: 400 }),
    }),
    /HTTP 400 for eth_chainId: request exceeds allowed log range/,
  );
});

test("requires distinct RPC origins and HTTPS for remote endpoints", async () => {
  await assert.rejects(
    verifyChain({ ...ENV, secondaryUrl: "http://127.0.0.1:8545", fetchImpl: mockFetch() }),
    /different origins/,
  );
  await assert.rejects(
    verifyChain({ ...ENV, primaryUrl: "http://rpc.example.com", fetchImpl: mockFetch() }),
    /must use HTTPS/,
  );
});

function poolMockFetch({
  secondaryTick = 42n,
  primaryLiquidity = 12345n,
  secondaryLiquidity = 12345n,
  hookCode = "0x",
  hooksAddress = "0x0000000000000000000000000000000000000000",
  initialized = true,
  stateViewCode = "0x6004",
  stateViewMismatch = false,
} = {}) {
  const zero = "0x0000000000000000000000000000000000000000";
  const key = [
    { type: "address" },
    { type: "address" },
    { type: "uint24" },
    { type: "int24" },
    { type: "address" },
  ];
  const poolId = keccak256(encodeAbiParameters(key, [zero, TOKEN, 3000n, 60n, hooksAddress]));
  const stateSlot = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }],
    [poolId, 6n],
  ));
  const liquiditySlot = `0x${(BigInt(stateSlot) + 3n).toString(16).padStart(64, "0")}`;
  const selector = toFunctionSelector("extsload(bytes32)");
  const slot0Selector = toFunctionSelector("getSlot0(bytes32)");
  const liquiditySelector = toFunctionSelector("getLiquidity(bytes32)");
  const primaryTick = 42n;

  return async (url, init) => {
    const host = new URL(url).host;
    const secondary = host.endsWith("8546");
    const { method, params } = JSON.parse(init.body);
    let result;
    if (method === "eth_chainId") result = "0x1237";
    else if (method === "eth_getCode") {
      result = params[0].toLowerCase() === UNISWAP_V4_POOL_MANAGER.toLowerCase()
        ? "0x6001"
        : params[0].toLowerCase() === UNISWAP_V4_STATE_VIEW.toLowerCase() ? stateViewCode : hookCode;
    } else if (method === "eth_call" && params[0].to.toLowerCase() === UNISWAP_V4_STATE_VIEW.toLowerCase()) {
      if (params[0].data.startsWith(slot0Selector)) {
        const tick = secondary ? secondaryTick : primaryTick;
        const sqrtPriceX96 = initialized ? 1n << 96n : 0n;
        const lpFee = 3000n;
        const actualTick = secondary && stateViewMismatch ? tick + 1n : tick;
        result = encodeAbiParameters(
          [
            { type: "uint160" },
            { type: "int24" },
            { type: "uint24" },
            { type: "uint24" },
          ],
          [sqrtPriceX96, actualTick, 0n, lpFee],
        );
      } else if (params[0].data.startsWith(liquiditySelector)) {
        const liquidity = secondary ? secondaryLiquidity : primaryLiquidity;
        result = encodeAbiParameters([{ type: "uint128" }], [liquidity]);
      } else {
        throw new Error("Unexpected StateView function");
      }
    } else if (method === "eth_call" && params[0].data.startsWith(selector)) {
      if (params[0].data.toLowerCase() === `${selector}${stateSlot.slice(2)}`.toLowerCase()) {
        const tick = secondary ? secondaryTick : primaryTick;
        const sqrtPriceX96 = initialized ? 1n << 96n : 0n;
        const lpFee = 3000n;
        const packed = sqrtPriceX96 | (tick << 160n) | (lpFee << 208n);
        result = `0x${packed.toString(16).padStart(64, "0")}`;
      } else if (params[0].data.toLowerCase() === `${selector}${liquiditySlot.slice(2)}`.toLowerCase()) {
        const liquidity = secondary ? secondaryLiquidity : primaryLiquidity;
        result = `0x${liquidity.toString(16).padStart(64, "0")}`;
      } else {
        throw new Error("Unexpected v4 storage slot");
      }
    } else {
      throw new Error(`Unexpected RPC method ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
}

const POOL = {
  ...ENV,
  commonBlock: "256",
  fee: "3000",
  tickSpacing: "60",
  hooksAddress: "0x0000000000000000000000000000000000000000",
};

test("reads and compares initialized v4 pool state on both RPCs", async () => {
  const report = await verifyV4Pool({ ...POOL, fetchImpl: poolMockFetch() });
  assert.equal(report.initialized, true);
  assert.equal(report.currentTick, "42");
  assert.equal(report.lpFee, "3000");
  assert.equal(report.activeLiquidity, "12345");
  assert.equal(report.hasActiveLiquidity, true);
  assert.equal(report.commonBlock, "256");
});

test("rejects pool state that differs between providers", async () => {
  await assert.rejects(
    verifyV4Pool({ ...POOL, fetchImpl: poolMockFetch({ secondaryTick: 43n }) }),
    /disagree on PoolManager, hook, or pool state/,
  );
});

test("cross-checks StateView results against PoolManager storage", async () => {
  await assert.rejects(
    verifyV4Pool({ ...POOL, fetchImpl: poolMockFetch({ stateViewMismatch: true }) }),
    /StateView disagrees with PoolManager storage/,
  );
});

test("requires the official StateView contract to be deployed", async () => {
  await assert.rejects(
    verifyV4Pool({ ...POOL, fetchImpl: poolMockFetch({ stateViewCode: "0x" }) }),
    /no Uniswap v4 StateView bytecode/,
  );
});

test("reports an uninitialized pool instead of treating empty state as liquidity", async () => {
  const report = await verifyV4Pool({
    ...POOL,
    fetchImpl: poolMockFetch({ initialized: false, primaryLiquidity: 0n, secondaryLiquidity: 0n }),
  });
  assert.equal(report.initialized, false);
  assert.equal(report.hasActiveLiquidity, false);
});

test("rejects a pool key with invalid tick spacing", async () => {
  await assert.rejects(
    verifyV4Pool({ ...POOL, tickSpacing: "0", fetchImpl: poolMockFetch() }),
    /non-zero int24/,
  );
});

test("rejects nonzero hook addresses with no deployed contract", async () => {
  await assert.rejects(
    verifyV4Pool({
      ...POOL,
      hooksAddress: "0x0000000000000000000000000000000000000001",
      fetchImpl: poolMockFetch({ hooksAddress: "0x0000000000000000000000000000000000000001" }),
    }),
    /no hooks contract bytecode/,
  );
});

const INITIALIZE_TOPIC = keccak256(toBytes("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function initializeLog({ blockNumber, idByte = "11", fee = 3000n, tickSpacing = 60n, hooks = ZERO_ADDRESS } = {}) {
  const topicAddress = (address) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
  const blockHash = `0x${"aa".repeat(32)}`;
  const transactionHash = `0x${idByte.repeat(32)}`;
  return {
    address: UNISWAP_V4_POOL_MANAGER,
    topics: [
      INITIALIZE_TOPIC,
      `0x${idByte.repeat(32)}`,
      topicAddress(ZERO_ADDRESS),
      topicAddress(TOKEN),
    ],
    data: encodeAbiParameters(
      [
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
        { type: "uint160" },
        { type: "int24" },
      ],
      [fee, tickSpacing, hooks, 1n << 96n, 0n],
    ),
    blockNumber: `0x${BigInt(blockNumber).toString(16)}`,
    blockHash,
    transactionHash,
    logIndex: "0x0",
    removed: false,
  };
}

function discoveryMockFetch({ disagree = false } = {}) {
  const logs = [
    initializeLog({ blockNumber: 101, idByte: "11", fee: 3000n, tickSpacing: 60n }),
    initializeLog({ blockNumber: 112, idByte: "22", fee: 8388608n, tickSpacing: 1n, hooks: "0x987E330F00B79864a07FE81dFaC344D0078ABCC0" }),
  ];
  return async (url, init) => {
    const secondary = new URL(url).host.endsWith("8546");
    const { method, params } = JSON.parse(init.body);
    let result;
    if (method === "eth_chainId") result = "0x1237";
    else if (method === "eth_blockNumber") result = "0xc8";
    else if (method === "eth_getLogs") {
      result = logs.filter((log) => BigInt(log.blockNumber) >= BigInt(params[0].fromBlock)
        && BigInt(log.blockNumber) <= BigInt(params[0].toBlock));
      if (secondary && disagree && result.length > 0) {
        result = result.map((log) => ({ ...log, data: `${log.data.slice(0, -1)}${log.data.endsWith("0") ? "1" : "0"}` }));
      }
    } else {
      throw new Error(`Unexpected RPC method ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
}

test("discovers exact ETH/USDG Initialize pool keys in bounded chunks", async () => {
  const report = await discoverV4Pools({
    ...ENV,
    fromBlock: "100",
    toBlock: "115",
    chunkSize: 10,
    fetchImpl: discoveryMockFetch(),
  });
  assert.equal(report.scannedBlocks, "16");
  assert.equal(report.pools.length, 2);
  assert.equal(report.pools[0].fee, "3000");
  assert.equal(report.pools[0].tickSpacing, "60");
  assert.equal(report.pools[1].fee, "8388608");
  assert.equal(report.pools[1].hooks, "0x987E330F00B79864a07FE81dFaC344D0078ABCC0");
});

test("pool discovery rejects mismatched event logs between RPCs", async () => {
  await assert.rejects(
    discoverV4Pools({
      ...ENV,
      fromBlock: "100",
      toBlock: "115",
      fetchImpl: discoveryMockFetch({ disagree: true }),
    }),
    /disagree on ETH\/USDG Initialize logs/,
  );
});

test("pool discovery enforces a bounded, valid block range", async () => {
  await assert.rejects(
    discoverV4Pools({ ...ENV, fromBlock: "100", toBlock: "115", maxBlocks: 10, fetchImpl: discoveryMockFetch() }),
    /exceeds the 10-block safety limit/,
  );
  await assert.rejects(
    discoverV4Pools({ ...ENV, fromBlock: "300", toBlock: "200", fetchImpl: discoveryMockFetch() }),
    /must be at or below toBlock/,
  );
});
