import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters } from "viem";
import { readRobinhoodBalances } from "./robinhood-balances.ts";

const WALLET = "0x1234567890123456789012345678901234567890";
const TOKEN = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

function mockFetch({
  secondaryNativeBalance = "0xde0b6b3a7640000",
  secondaryTokenBalance = "0x1e8480",
  secondaryChainId = "0x1237",
  symbol = "USDG",
} = {}) {
  const calls: { host: string; method: string; block?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const host = new URL(String(input)).host;
    const secondary = host === "secondary.example";
    const { method, params } = JSON.parse(String(init?.body)) as {
      method: string;
      params: Array<string | { data: string }>;
    };
    const block = method === "eth_getBalance" || method === "eth_getCode" || method === "eth_call"
      ? String(params[1])
      : undefined;
    calls.push({ host, method, block });
    let result: string;
    switch (method) {
      case "eth_chainId":
        result = secondary ? secondaryChainId : "0x1237";
        break;
      case "eth_blockNumber":
        result = secondary ? "0x103" : "0x100";
        break;
      case "eth_getBalance":
        result = secondary ? secondaryNativeBalance : "0xde0b6b3a7640000";
        break;
      case "eth_getCode":
        result = "0x6001";
        break;
      case "eth_call": {
        const data = (params[0] as { data: string }).data;
        if (data === "0x95d89b41") {
          result = encodeAbiParameters([{ type: "string" }], [symbol]);
        } else if (data === "0x313ce567") {
          result = encodeAbiParameters([{ type: "uint8" }], [6]);
        } else if (data.startsWith("0x70a08231")) {
          result = encodeAbiParameters(
            [{ type: "uint256" }],
            [BigInt(secondary ? secondaryTokenBalance : "0x1e8480")],
          );
        } else {
          throw new Error(`Unexpected eth_call data: ${data}`);
        }
        break;
      }
      default:
        throw new Error(`Unexpected RPC method: ${method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: 1, result });
  };
  return { fetchImpl, calls };
}

const CONFIG = {
  address: WALLET,
  usdgAddress: TOKEN,
  primaryUrl: "https://primary.example",
  secondaryUrl: "https://secondary.example",
};

test("reads matching ETH and USDG balances at the lower shared RPC block", async () => {
  const { fetchImpl, calls } = mockFetch();
  const report = await readRobinhoodBalances({ ...CONFIG, fetchImpl });
  assert.equal(report.chainId, 4663);
  assert.equal(report.commonBlock, "256");
  assert.equal(report.address, WALLET);
  assert.deepEqual(report.balances, [
    { symbol: "ETH", decimals: 18, balanceBaseUnits: "1000000000000000000" },
    { symbol: "USDG", decimals: 6, balanceBaseUnits: "2000000" },
  ]);
  assert.ok(calls.filter((call) => call.block).every((call) => call.block === "0x100"));
});

test("rejects provider balance disagreement", async () => {
  const { fetchImpl } = mockFetch({ secondaryTokenBalance: "0x1e8481" });
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, fetchImpl }),
    /RPCs disagree on wallet balances/,
  );
});

test("rejects providers on a chain other than Robinhood", async () => {
  const { fetchImpl } = mockFetch({ secondaryChainId: "0x1" });
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, fetchImpl }),
    /not on Robinhood Chain/,
  );
});

test("rejects token metadata that does not match configured USDG", async () => {
  const { fetchImpl } = mockFetch({ symbol: "FAKE" });
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, fetchImpl }),
    /metadata mismatch/,
  );
});

test("requires distinct HTTPS RPC endpoints and a valid token address", async () => {
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, primaryUrl: "http://primary.example" }),
    /must use HTTPS/,
  );
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, secondaryUrl: CONFIG.primaryUrl }),
    /different origins/,
  );
  await assert.rejects(
    readRobinhoodBalances({ ...CONFIG, usdgAddress: "not-an-address" }),
    /valid ROBINHOOD_USDG_ADDRESS/,
  );
});
