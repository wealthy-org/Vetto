import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAbiParameters, getAddress, keccak256, toFunctionSelector } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663n;
// Listed in Uniswap's public deployment feed: https://developers.uniswap.org/deployments.json
export const UNISWAP_V4_POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const POOLS_SLOT = 6n;
const LIQUIDITY_OFFSET = 3n;
const EXTSLOAD_SELECTOR = toFunctionSelector("extsload(bytes32)");
const USDG_SYMBOL = "USDG";
const USDG_DECIMALS = 6n;

function endpoint(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid RPC URL.`);
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed only for loopback development RPCs) and must not contain credentials.`);
  }
  return url;
}

function rpcQuantity(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`${label} returned an invalid hexadecimal quantity.`);
  }
  return BigInt(value);
}

async function rpcCall(url, method, params, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`RPC host ${url.host} could not be reached for ${method}.`);
  }

  if (!response.ok) throw new Error(`RPC host ${url.host} returned HTTP ${response.status} for ${method}.`);

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`RPC host ${url.host} returned invalid JSON for ${method}.`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`RPC host ${url.host} returned an invalid JSON-RPC response for ${method}.`);
  }
  if (body.error) {
    throw new Error(`RPC host ${url.host} rejected ${method}: ${String(body.error.message ?? "JSON-RPC error")}`);
  }
  if (body.jsonrpc !== "2.0" || body.id !== 1 || !("result" in body)) {
    throw new Error(`RPC host ${url.host} returned an invalid JSON-RPC response for ${method}.`);
  }
  return body.result;
}

function decodeSymbol(raw) {
  if (typeof raw !== "string" || !/^0x[0-9a-f]*$/i.test(raw)) {
    throw new Error("USDG symbol() returned invalid ABI data.");
  }
  const data = raw.slice(2);
  if (data.length === 64) {
    return Buffer.from(data, "hex").toString("utf8").replace(/\0+$/, "");
  }
  if (data.length < 128) throw new Error("USDG symbol() returned invalid ABI data.");

  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  if (!Number.isSafeInteger(offset) || offset < 64 || offset + 64 > data.length) {
    throw new Error("USDG symbol() returned invalid ABI data.");
  }
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  const start = offset + 64;
  const end = start + length * 2;
  if (!Number.isSafeInteger(length) || end > data.length) {
    throw new Error("USDG symbol() returned invalid ABI data.");
  }
  return Buffer.from(data.slice(start, end), "hex").toString("utf8");
}

function validateAddress(address) {
  if (typeof address !== "string" || !/^0x[0-9a-f]{40}$/i.test(address)) {
    throw new Error("ROBINHOOD_USDG_ADDRESS must be a 20-byte EVM address.");
  }
  return getAddress(address);
}

export async function verifyChain({
  primaryUrl,
  secondaryUrl,
  usdgAddress,
  fetchImpl = fetch,
}) {
  if (!primaryUrl || !secondaryUrl || !usdgAddress) {
    throw new Error("Set ROBINHOOD_RPC_URL_PRIMARY, ROBINHOOD_RPC_URL_SECONDARY, and ROBINHOOD_USDG_ADDRESS.");
  }

  const primary = endpoint(primaryUrl, "Primary RPC");
  const secondary = endpoint(secondaryUrl, "Secondary RPC");
  if (primary.origin === secondary.origin) {
    throw new Error("Primary and secondary RPCs must use different origins.");
  }
  const tokenAddress = validateAddress(usdgAddress);
  const providers = [
    { name: "primary", url: primary },
    { name: "secondary", url: secondary },
  ];

  const heads = await Promise.all(providers.map(async (provider) => {
    const [chainIdRaw, blockRaw] = await Promise.all([
      rpcCall(provider.url, "eth_chainId", [], fetchImpl),
      rpcCall(provider.url, "eth_blockNumber", [], fetchImpl),
    ]);
    const chainId = rpcQuantity(chainIdRaw, `${provider.name} RPC chainId`);
    const blockNumber = rpcQuantity(blockRaw, `${provider.name} RPC blockNumber`);
    if (chainId !== ROBINHOOD_CHAIN_ID) {
      throw new Error(`${provider.name} RPC is on chain ${chainId}; expected ${ROBINHOOD_CHAIN_ID}.`);
    }
    return { ...provider, blockNumber };
  }));
  const commonBlock = heads.reduce((lowest, head) => head.blockNumber < lowest ? head.blockNumber : lowest, heads[0].blockNumber);
  const commonBlockTag = `0x${commonBlock.toString(16)}`;

  const snapshots = await Promise.all(heads.map(async (provider) => {
    const [managerCode, tokenCode, symbolRaw, decimalsRaw] = await Promise.all([
      rpcCall(provider.url, "eth_getCode", [UNISWAP_V4_POOL_MANAGER, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [tokenAddress, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: tokenAddress, data: "0x95d89b41" }, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: tokenAddress, data: "0x313ce567" }, commonBlockTag], fetchImpl),
    ]);
    if (typeof managerCode !== "string" || !/^0x[0-9a-f]*$/i.test(managerCode) || managerCode.toLowerCase() === "0x") {
      throw new Error(`${provider.name} RPC has no PoolManager bytecode at block ${commonBlock}.`);
    }
    if (typeof tokenCode !== "string" || !/^0x[0-9a-f]*$/i.test(tokenCode) || tokenCode.toLowerCase() === "0x") {
      throw new Error(`${provider.name} RPC has no USDG contract bytecode at block ${commonBlock}.`);
    }
    const symbol = decodeSymbol(symbolRaw);
    const decimals = rpcQuantity(decimalsRaw, `${provider.name} RPC USDG decimals`);
    if (symbol !== USDG_SYMBOL || decimals !== USDG_DECIMALS) {
      throw new Error(`${provider.name} RPC token metadata mismatch: expected ${USDG_SYMBOL} with ${USDG_DECIMALS} decimals.`);
    }
    return { managerCode: managerCode.toLowerCase(), tokenCode: tokenCode.toLowerCase(), symbol, decimals };
  }));

  if (snapshots[0].managerCode !== snapshots[1].managerCode || snapshots[0].tokenCode !== snapshots[1].tokenCode) {
    throw new Error(`RPCs disagree on contract bytecode at common block ${commonBlock}.`);
  }

  return {
    chainId: Number(ROBINHOOD_CHAIN_ID),
    commonBlock: commonBlock.toString(),
    providers: heads.map(({ name, url, blockNumber }) => ({
      name,
      host: url.host,
      blockNumber: blockNumber.toString(),
    })),
    poolManager: UNISWAP_V4_POOL_MANAGER,
    usdg: { address: tokenAddress, symbol: snapshots[0].symbol, decimals: Number(snapshots[0].decimals) },
    note: "Read-only checks passed. This does not verify token ownership, pool liquidity, quote execution, or transaction safety.",
  };
}

function validatePoolKey({ fee, tickSpacing, hooksAddress }) {
  if (!/^\d+$/.test(String(fee)) || BigInt(fee) > 0xffffffn) {
    throw new Error("ROBINHOOD_POOL_FEE must be a uint24 decimal value.");
  }
  if (!/^-?\d+$/.test(String(tickSpacing))) {
    throw new Error("ROBINHOOD_POOL_TICK_SPACING must be a signed decimal integer.");
  }
  const spacing = BigInt(tickSpacing);
  if (spacing === 0n || spacing < -(1n << 23n) || spacing >= (1n << 23n)) {
    throw new Error("ROBINHOOD_POOL_TICK_SPACING must be a non-zero int24 value.");
  }
  if (spacing < 0n) {
    throw new Error("Negative tick spacing is not supported by this checker.");
  }
  if (typeof hooksAddress !== "string" || !/^0x[0-9a-f]{40}$/i.test(hooksAddress)) {
    throw new Error("ROBINHOOD_POOL_HOOKS_ADDRESS must be a 20-byte EVM address.");
  }
  return { fee: BigInt(fee), tickSpacing: spacing, hooksAddress: getAddress(hooksAddress) };
}

function decodePoolState(slot0Raw, liquidityRaw) {
  for (const [name, raw] of [["slot0", slot0Raw], ["liquidity", liquidityRaw]]) {
    if (typeof raw !== "string" || !/^0x[0-9a-f]{64}$/i.test(raw)) {
      throw new Error(`PoolManager returned invalid ${name} storage data.`);
    }
  }
  const slot0 = BigInt(slot0Raw);
  const sqrtPriceX96 = slot0 & ((1n << 160n) - 1n);
  const encodedTick = (slot0 >> 160n) & ((1n << 24n) - 1n);
  const tick = encodedTick >= (1n << 23n) ? encodedTick - (1n << 24n) : encodedTick;
  const protocolFee = (slot0 >> 184n) & 0xffffffn;
  const lpFee = (slot0 >> 208n) & 0xffffffn;
  const activeLiquidity = BigInt(liquidityRaw) & ((1n << 128n) - 1n);
  return { sqrtPriceX96, tick, protocolFee, lpFee, activeLiquidity };
}

/**
 * Read a specific USDG/native-ETH v4 pool at the shared block from verifyChain.
 * The supplied fee, spacing, and hooks must come from a trusted Initialize event/source.
 */
export async function verifyV4Pool({
  primaryUrl,
  secondaryUrl,
  usdgAddress,
  commonBlock,
  fee,
  tickSpacing,
  hooksAddress,
  fetchImpl = fetch,
}) {
  if (!commonBlock || !/^\d+$/.test(String(commonBlock))) {
    throw new Error("A common block from verifyChain is required.");
  }
  const usd = validateAddress(usdgAddress);
  const hooks = validatePoolKey({ fee, tickSpacing, hooksAddress });
  const primary = endpoint(primaryUrl, "Primary RPC");
  const secondary = endpoint(secondaryUrl, "Secondary RPC");
  if (primary.origin === secondary.origin) {
    throw new Error("Primary and secondary RPCs must use different origins.");
  }

  const [currency0, currency1] = [
    "0x0000000000000000000000000000000000000000",
    usd,
  ].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const poolKey = [
    { type: "address" },
    { type: "address" },
    { type: "uint24" },
    { type: "int24" },
    { type: "address" },
  ];
  const poolId = keccak256(encodeAbiParameters(poolKey, [
    currency0,
    currency1,
    hooks.fee,
    hooks.tickSpacing,
    hooks.hooksAddress,
  ]));
  const stateSlot = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }],
    [poolId, POOLS_SLOT],
  ));
  const liquiditySlot = `0x${(BigInt(stateSlot) + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}`;
  const blockTag = `0x${BigInt(commonBlock).toString(16)}`;
  const providers = [
    { name: "primary", url: primary },
    { name: "secondary", url: secondary },
  ];

  const states = await Promise.all(providers.map(async (provider) => {
    const [chainIdRaw, managerCode, slot0Raw, liquidityRaw, hooksCode] = await Promise.all([
      rpcCall(provider.url, "eth_chainId", [], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [UNISWAP_V4_POOL_MANAGER, blockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_POOL_MANAGER, data: `${EXTSLOAD_SELECTOR}${stateSlot.slice(2)}` },
        blockTag,
      ], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_POOL_MANAGER, data: `${EXTSLOAD_SELECTOR}${liquiditySlot.slice(2)}` },
        blockTag,
      ], fetchImpl),
      hooks.hooksAddress.toLowerCase() === "0x0000000000000000000000000000000000000000"
        ? Promise.resolve("0x")
        : rpcCall(provider.url, "eth_getCode", [hooks.hooksAddress, blockTag], fetchImpl),
    ]);
    if (rpcQuantity(chainIdRaw, `${provider.name} RPC chainId`) !== ROBINHOOD_CHAIN_ID) {
      throw new Error(`${provider.name} RPC is not on Robinhood Chain.`);
    }
    if (typeof managerCode !== "string" || !/^0x[0-9a-f]+$/i.test(managerCode)) {
      throw new Error(`${provider.name} RPC returned invalid PoolManager code.`);
    }
    if (hooks.hooksAddress.toLowerCase() !== "0x0000000000000000000000000000000000000000"
      && (typeof hooksCode !== "string" || !/^0x[0-9a-f]+$/i.test(hooksCode) || hooksCode.toLowerCase() === "0x")) {
      throw new Error(`${provider.name} RPC has no hooks contract bytecode at the shared block.`);
    }
    return {
      managerCode: managerCode.toLowerCase(),
      hooksCode: hooksCode.toLowerCase(),
      state: decodePoolState(slot0Raw, liquidityRaw),
    };
  }));
  if (states[0].managerCode !== states[1].managerCode
    || states[0].hooksCode !== states[1].hooksCode
    || JSON.stringify(Object.fromEntries(Object.entries(states[0].state).map(([key, value]) => [key, value.toString()])))
      !== JSON.stringify(Object.fromEntries(Object.entries(states[1].state).map(([key, value]) => [key, value.toString()])))) {
    throw new Error(`RPCs disagree on PoolManager, hook, or pool state at block ${commonBlock}.`);
  }

  const state = states[0].state;
  const initialized = state.sqrtPriceX96 !== 0n;
  return {
    poolId,
    currencies: { currency0, currency1 },
    fee: hooks.fee.toString(),
    tickSpacing: hooks.tickSpacing.toString(),
    hooks: hooks.hooksAddress,
    commonBlock: String(commonBlock),
    initialized,
    currentTick: state.tick.toString(),
    sqrtPriceX96: state.sqrtPriceX96.toString(),
    protocolFee: state.protocolFee.toString(),
    lpFee: state.lpFee.toString(),
    activeLiquidity: state.activeLiquidity.toString(),
    hasActiveLiquidity: state.activeLiquidity > 0n,
    note: "Read-only pool state only. It does not prove trade-size liquidity, executable quotes, fair pricing, or transaction safety.",
  };
}

async function main() {
  const report = await verifyChain({
    primaryUrl: process.env.ROBINHOOD_RPC_URL_PRIMARY,
    secondaryUrl: process.env.ROBINHOOD_RPC_URL_SECONDARY,
    usdgAddress: process.env.ROBINHOOD_USDG_ADDRESS,
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Chain verification failed.");
    process.exitCode = 1;
  });
}
