import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyChain, UNISWAP_V4_POOL_MANAGER } from "./verify-chain.mjs";

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

function mockFetch({ chainId = "0x1237", primaryBlock = "0x100", secondaryBlock = "0x102", mismatchedCode = false, symbol = "USDG", decimals = "0x6" } = {}) {
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
