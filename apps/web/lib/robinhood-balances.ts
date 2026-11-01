import { decodeAbiParameters, getAddress, type Hex } from "viem";

const ROBINHOOD_CHAIN_ID = 4663n;
const USDG_SYMBOL = "USDG";
const USDG_DECIMALS = 6;

interface Provider {
  name: string;
  url: URL;
}

interface RpcResponse {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown } | null;
}

function provider(raw: string | undefined, name: string): Provider {
  if (!raw) throw new Error(`Configure ${name} RPC URL.`);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} RPC URL is invalid.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${name} RPC must use HTTPS and must not contain credentials.`);
  }
  return { name, url };
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} returned an invalid RPC quantity.`);
  }
  return BigInt(value);
}

async function rpcCall(
  rpc: Provider,
  method: string,
  params: unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(rpc.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`${rpc.name} RPC could not be reached for ${method}.`);
  }
  if (!response.ok) throw new Error(`${rpc.name} RPC returned HTTP ${response.status} for ${method}.`);

  let body: RpcResponse;
  try {
    body = await response.json() as RpcResponse;
  } catch {
    throw new Error(`${rpc.name} RPC returned invalid JSON for ${method}.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || body.jsonrpc !== "2.0" || body.id !== 1) {
    throw new Error(`${rpc.name} RPC returned an invalid JSON-RPC response for ${method}.`);
  }
  if (body.error) {
    const message = typeof body.error.message === "string" ? body.error.message : "JSON-RPC error";
    throw new Error(`${rpc.name} RPC rejected ${method}: ${message}`);
  }
  if (!("result" in body)) throw new Error(`${rpc.name} RPC returned an invalid JSON-RPC response for ${method}.`);
  return body.result;
}

function tokenMetadata(rawSymbol: unknown, rawDecimals: unknown, name: string) {
  if (typeof rawSymbol !== "string" || !/^0x[0-9a-f]+$/i.test(rawSymbol)) {
    throw new Error(`${name} RPC returned invalid USDG symbol data.`);
  }
  if (typeof rawDecimals !== "string" || !/^0x[0-9a-f]{64}$/i.test(rawDecimals)) {
    throw new Error(`${name} RPC returned invalid USDG decimals data.`);
  }
  let symbol: string;
  let decimals: number;
  try {
    symbol = decodeAbiParameters([{ type: "string" }], rawSymbol as Hex)[0];
    decimals = decodeAbiParameters([{ type: "uint8" }], rawDecimals as Hex)[0];
  } catch {
    throw new Error(`${name} RPC returned invalid USDG metadata.`);
  }
  if (symbol !== USDG_SYMBOL || decimals !== USDG_DECIMALS) {
    throw new Error(`${name} RPC token metadata mismatch: expected USDG with 6 decimals.`);
  }
  return { symbol, decimals };
}

export async function readRobinhoodBalances({
  address,
  primaryUrl,
  secondaryUrl,
  usdgAddress,
  fetchImpl = fetch,
}: {
  address: string;
  primaryUrl?: string;
  secondaryUrl?: string;
  usdgAddress?: string;
  fetchImpl?: typeof fetch;
}) {
  let wallet: `0x${string}`;
  let token: `0x${string}`;
  try {
    wallet = getAddress(address);
  } catch {
    throw new Error("The linked wallet address is invalid.");
  }
  try {
    if (!usdgAddress || !/^0x[0-9a-f]{40}$/i.test(usdgAddress)) throw new Error();
    token = getAddress(usdgAddress);
  } catch {
    throw new Error("Configure a valid ROBINHOOD_USDG_ADDRESS.");
  }

  const primary = provider(primaryUrl, "Primary");
  const secondary = provider(secondaryUrl, "Secondary");
  if (primary.url.origin === secondary.url.origin) {
    throw new Error("Primary and secondary RPCs must use different origins.");
  }
  const providers = [primary, secondary];

  const heads = await Promise.all(providers.map(async (rpc) => {
    const [chainRaw, blockRaw] = await Promise.all([
      rpcCall(rpc, "eth_chainId", [], fetchImpl),
      rpcCall(rpc, "eth_blockNumber", [], fetchImpl),
    ]);
    const chainId = quantity(chainRaw, `${rpc.name} chain ID`);
    if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`${rpc.name} RPC is not on Robinhood Chain (4663).`);
    return { rpc, blockNumber: quantity(blockRaw, `${rpc.name} block number`) };
  }));
  const commonBlock = heads.reduce((lowest, head) => head.blockNumber < lowest ? head.blockNumber : lowest, heads[0]!.blockNumber);
  const blockTag = `0x${commonBlock.toString(16)}`;
  const balanceOfData = `0x70a08231${wallet.slice(2).toLowerCase().padStart(64, "0")}`;

  const snapshots = await Promise.all(heads.map(async ({ rpc }) => {
    const [nativeRaw, tokenCode, symbolRaw, decimalsRaw, tokenBalanceRaw] = await Promise.all([
      rpcCall(rpc, "eth_getBalance", [wallet, blockTag], fetchImpl),
      rpcCall(rpc, "eth_getCode", [token, blockTag], fetchImpl),
      rpcCall(rpc, "eth_call", [{ to: token, data: "0x95d89b41" }, blockTag], fetchImpl),
      rpcCall(rpc, "eth_call", [{ to: token, data: "0x313ce567" }, blockTag], fetchImpl),
      rpcCall(rpc, "eth_call", [{ to: token, data: balanceOfData }, blockTag], fetchImpl),
    ]);
    if (typeof tokenCode !== "string" || !/^0x[0-9a-f]+$/i.test(tokenCode) || tokenCode.toLowerCase() === "0x") {
      throw new Error(`${rpc.name} RPC has no USDG contract bytecode at block ${commonBlock}.`);
    }
    if (typeof tokenBalanceRaw !== "string" || !/^0x[0-9a-f]{64}$/i.test(tokenBalanceRaw)) {
      throw new Error(`${rpc.name} RPC returned invalid USDG balance data.`);
    }
    const metadata = tokenMetadata(symbolRaw, decimalsRaw, rpc.name);
    return {
      tokenCode: tokenCode.toLowerCase(),
      nativeBalance: quantity(nativeRaw, `${rpc.name} native balance`),
      tokenBalance: BigInt(tokenBalanceRaw),
      ...metadata,
    };
  }));

  const first = snapshots[0]!;
  const second = snapshots[1]!;
  if (first.tokenCode !== second.tokenCode
    || first.symbol !== second.symbol
    || first.decimals !== second.decimals
    || first.nativeBalance !== second.nativeBalance
    || first.tokenBalance !== second.tokenBalance) {
    throw new Error(`RPCs disagree on wallet balances or USDG contract data at block ${commonBlock}.`);
  }

  return {
    chainId: Number(ROBINHOOD_CHAIN_ID),
    address: wallet,
    commonBlock: commonBlock.toString(),
    providers: heads.map(({ rpc, blockNumber }) => ({ name: rpc.name, blockNumber: blockNumber.toString() })),
    balances: [
      { symbol: "ETH", decimals: 18, balanceBaseUnits: first.nativeBalance.toString() },
      { symbol: first.symbol, decimals: first.decimals, balanceBaseUnits: first.tokenBalance.toString() },
    ],
    note: "Read-only balances at the common block. USDG symbol and decimals are checked, but token ownership/official status is not established by this endpoint.",
  };
}
