import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  keccak256,
  toFunctionSelector,
} from "viem";

export const ROBINHOOD_CHAIN_ID = 4663n;
// Listed in Uniswap's public deployment feed: https://developers.uniswap.org/deployments.json
export const UNISWAP_V4_POOL_MANAGER = 
  "0x8366a39CC670B4001A1121B8F6A443A643e40951";

// Published in Uniswap/v4-periphery test/ReservesLens.fork.t.sol.
export const UNISWAP_V4_STATE_VIEW = 
"0xF3334192D15450CdD385c8B70e03f9A6bD9E673b";

export const ROBINHOOD_WETH =
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

export const UNISWAP_V4_QUOTER =
  "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

export const UNISWAP_UNIVERSAL_ROUTER_V2_1_2 =
  "0x204FAca1764B154221e35c0d20aBb3c525710498";

const POOLS_SLOT = 6n;
const LIQUIDITY_OFFSET = 3n;
const EXTSLOAD_SELECTOR = toFunctionSelector("extsload(bytes32)");
const STATE_VIEW_SLOT0_SELECTOR = toFunctionSelector("getSlot0(bytes32)");
const STATE_VIEW_LIQUIDITY_SELECTOR = toFunctionSelector("getLiquidity(bytes32)");
const INITIALIZE_TOPIC = keccak256(new TextEncoder().encode(
  "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)",
));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
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


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpcCall(url, method, params, fetchImpl) {
  const maxAttempts = method === "eth_getLogs" ? 6 : 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;

    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(`RPC host ${url.host} could not be reached for ${method}.`);
      }

      await sleep(Math.min(1_000 * 2 ** (attempt - 1), 10_000));
      continue;
    }

    const rawText = await response.text();

    let body;
    try {
      body = JSON.parse(rawText);
    } catch {
      if (!response.ok) {
        body = null;
      } else {
        throw new Error(`RPC host ${url.host} returned invalid JSON for ${method}.`);
      }
    }

    const rpcError = body?.error;
    const errorMessage = String(rpcError?.message ?? "");
    const retryable =
      response.status === 429 ||
      response.status === 408 ||
      response.status === 503 ||
      rpcError?.code === -32029 ||
      /rate.?limit|too many requests/i.test(errorMessage);

    if (!response.ok || rpcError) {
      if (retryable && attempt < maxAttempts) {
        const retryAfter = Number(rpcError?.data?.retry_after_ms);
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 120_000)
          : Math.min(2_000 * 2 ** (attempt - 1), 30_000);

        console.log(
          `${url.host} rate limited on ${method}. Retry ${attempt + 1}/${maxAttempts} in ${waitMs} ms.`
        );

        await sleep(waitMs);
        continue;
      }

      const detail = rawText.replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(
        `RPC host ${url.host} returned HTTP ${response.status} for ${method}: ${detail}`
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error(`RPC host ${url.host} returned an invalid JSON-RPC response for ${method}.`);
    }

    if (body.jsonrpc !== "2.0" || body.id !== 1 || !("result" in body)) {
      throw new Error(`RPC host ${url.host} returned an invalid JSON-RPC response for ${method}.`);
    }

    return body.result;
  }

  throw new Error(`RPC host ${url.host} failed after retries for ${method}.`);
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

  
  const wethAddress = getAddress(ROBINHOOD_WETH);
  const quoterAddress = getAddress(UNISWAP_V4_QUOTER);
  const routerAddress = getAddress(UNISWAP_UNIVERSAL_ROUTER_V2_1_2);

  const snapshots = await Promise.all(heads.map(async (provider) => {
    const [
      managerCode,
      tokenCode,
      symbolRaw,
      decimalsRaw,
      wethCode,
      wethSymbolRaw,
      wethDecimalsRaw,
      quoterCode,
      routerCode,
    ] = await Promise.all([
      rpcCall(provider.url, "eth_getCode", [UNISWAP_V4_POOL_MANAGER, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [tokenAddress, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: tokenAddress, data: "0x95d89b41" }, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: tokenAddress, data: "0x313ce567" }, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [wethAddress, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: wethAddress, data: "0x95d89b41" }, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [{ to: wethAddress, data: "0x313ce567" }, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [quoterAddress, commonBlockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [routerAddress, commonBlockTag], fetchImpl),
    ]);

    const contracts = [
      ["PoolManager", managerCode],
      ["USDG", tokenCode],
      ["WETH", wethCode],
      ["Quoter", quoterCode],
      ["Universal Router 2.1.2", routerCode],
    ];

    for (const [name, code] of contracts) {
      if (typeof code !== "string" || !/^0x[0-9a-f]+$/i.test(code) || code.toLowerCase() === "0x") {
        throw new Error(`${provider.name} RPC has no valid ${name} bytecode at block ${commonBlock}.`);
      }
    }

    const symbol = decodeSymbol(symbolRaw);
    const decimals = rpcQuantity(decimalsRaw, `${provider.name} RPC USDG decimals`);

    if (symbol !== USDG_SYMBOL || decimals !== USDG_DECIMALS) {
      throw new Error(`${provider.name} RPC token metadata mismatch: expected USDG with 6 decimals.`);
    }

    const wethSymbol = decodeSymbol(wethSymbolRaw);
    const wethDecimals = rpcQuantity(wethDecimalsRaw, `${provider.name} RPC WETH decimals`);

    if (wethSymbol !== "WETH" || wethDecimals !== 18n) {
      throw new Error(`${provider.name} RPC token metadata mismatch: expected WETH with 18 decimals.`);
    }

    return {
      managerCode: managerCode.toLowerCase(),
      tokenCode: tokenCode.toLowerCase(),
      wethCode: wethCode.toLowerCase(),
      quoterCode: quoterCode.toLowerCase(),
      routerCode: routerCode.toLowerCase(),
      symbol,
      decimals,
      wethSymbol,
      wethDecimals,
    };
  }));

  const bytecodeFields = [
    "managerCode",
    "tokenCode",
    "wethCode",
    "quoterCode",
    "routerCode",
  ];

  if (bytecodeFields.some((field) => snapshots[0][field] !== snapshots[1][field])) {
    throw new Error(`RPCs disagree on contract bytecode at common block ${commonBlock}.`);
  }

  if (snapshots[0].managerCode !== snapshots[1].managerCode
    || snapshots[0].tokenCode !== snapshots[1].tokenCode) {
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
    usdg: {
      address: tokenAddress,
      symbol: snapshots[0].symbol,
      decimals: Number(snapshots[0].decimals),
    },
    weth: {
      address: wethAddress,
      symbol: snapshots[0].wethSymbol,
      decimals: Number(snapshots[0].wethDecimals),
    },
    deployments: {
      quoter: quoterAddress,
      universalRouterV2_1_2: routerAddress,
    },
    note: "Read-only checks passed. Contract bytecode and token metadata were checked against two RPCs. This does not verify Quoter/router deployment, pool liquidity, quote execution, or transaction safety.",
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

function indexedAddressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function decodeInitializeLog(log, expectedCurrencies, fromBlock, toBlock) {
  if (!log || typeof log !== "object" || log.removed === true
    || typeof log.address !== "string"
    || log.address.toLowerCase() !== UNISWAP_V4_POOL_MANAGER.toLowerCase()
    || !Array.isArray(log.topics)
    || log.topics.length !== 4
    || typeof log.data !== "string"
    || !/^0x[0-9a-f]{320}$/i.test(log.data)) {
    throw new Error("RPC returned a malformed or removed Uniswap v4 Initialize log.");
  }
  const [signature, id, currency0Topic, currency1Topic] = log.topics;
  if (typeof signature !== "string" || signature.toLowerCase() !== INITIALIZE_TOPIC
    || typeof id !== "string" || !/^0x[0-9a-f]{64}$/i.test(id)
    || typeof currency0Topic !== "string" || typeof currency1Topic !== "string"
    || currency0Topic.toLowerCase() !== indexedAddressTopic(expectedCurrencies[0]).toLowerCase()
    || currency1Topic.toLowerCase() !== indexedAddressTopic(expectedCurrencies[1]).toLowerCase()) {
    throw new Error("RPC returned a Uniswap v4 Initialize log that does not match the requested token pair.");
  }
  const blockNumber = rpcQuantity(log.blockNumber, "Initialize log blockNumber");
  if (blockNumber < fromBlock || blockNumber > toBlock) {
    throw new Error("RPC returned an Initialize log outside the requested block range.");
  }
  if (typeof log.transactionHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(log.transactionHash)
    || typeof log.logIndex !== "string" || !/^0x[0-9a-f]+$/i.test(log.logIndex)
    || typeof log.blockHash !== "string" || !/^0x[0-9a-f]{64}$/i.test(log.blockHash)) {
    throw new Error("RPC returned an Initialize log with invalid block or transaction metadata.");
  }

  const [fee, tickSpacing, hooks, sqrtPriceX96, tick] = decodeAbiParameters(
    [
      { type: "uint24" },
      { type: "int24" },
      { type: "address" },
      { type: "uint160" },
      { type: "int24" },
    ],
    log.data,
  );
  const pool = {
    poolId: id.toLowerCase(),
    currency0: getAddress(expectedCurrencies[0]),
    currency1: getAddress(expectedCurrencies[1]),
    fee: fee.toString(),
    tickSpacing: tickSpacing.toString(),
    hooks: getAddress(hooks),
    initializedAtBlock: blockNumber.toString(),
    initializedSqrtPriceX96: sqrtPriceX96.toString(),
    initializedTick: tick.toString(),
    transactionHash: log.transactionHash.toLowerCase(),
    logIndex: rpcQuantity(log.logIndex, "Initialize log logIndex").toString(),
    blockHash: log.blockHash.toLowerCase(),
  };
  validatePoolKey({ fee: pool.fee, tickSpacing: pool.tickSpacing, hooksAddress: pool.hooks });
  return pool;
}

/**
 * Discover pools for the exact native-ETH/USDG pair in a bounded block range.
 * Both RPCs must return the same Initialize logs; state can then be checked at commonBlock.
 */
export async function discoverV4Pools({
  primaryUrl,
  secondaryUrl,
  usdgAddress,
  fromBlock,
  toBlock,
  chunkSize = 1_000,
  chunkDelayMs = 1_500,
  maxBlocks = 250_000,
  fetchImpl = fetch,
}) {
  if (!/^\d+$/.test(String(fromBlock)) || (toBlock !== undefined && !/^\d+$/.test(String(toBlock)))) {
    throw new Error("Pool scan fromBlock and toBlock must be decimal block numbers.");
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 10_000) {
    throw new Error("Pool scan chunkSize must be between 1 and 10000 blocks.");
  }
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1) {
    throw new Error("Pool scan maxBlocks must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(chunkDelayMs) || chunkDelayMs < 0 || chunkDelayMs > 60_000) {
    throw new Error("Pool scan chunkDelayMs must be between 0 and 60000.");
  }

  const tokenAddress = validateAddress(usdgAddress);
  const wethAddress = validateAddress(ROBINHOOD_WETH);

  const currencyPairs = [
    [ZERO_ADDRESS, tokenAddress],
    [wethAddress, tokenAddress],
  ].map((pair) =>
    pair.sort((a, b) =>
      a.toLowerCase() < b.toLowerCase() ? -1 :
      a.toLowerCase() > b.toLowerCase() ? 1 : 0
    )
  );
  const primary = endpoint(primaryUrl, "Primary RPC");
  const secondary = endpoint(secondaryUrl, "Secondary RPC");
  if (primary.origin === secondary.origin) {
    throw new Error("Primary and secondary RPCs must use different origins.");
  }
  const providers = [
    { name: "primary", url: primary },
    { name: "secondary", url: secondary },
  ];
  const chainIds = await Promise.all(providers.map(async (provider) =>
    rpcQuantity(await rpcCall(provider.url, "eth_chainId", [], fetchImpl), `${provider.name} RPC chainId`)));
  if (chainIds.some((chainId) => chainId !== ROBINHOOD_CHAIN_ID)) {
    throw new Error("Both RPCs must be on Robinhood Chain (4663) before scanning pool events.");
  }
  const heads = await Promise.all(providers.map(async (provider) =>
    rpcQuantity(await rpcCall(provider.url, "eth_blockNumber", [], fetchImpl), `${provider.name} RPC blockNumber`)));
  const commonHead = heads[0] < heads[1] ? heads[0] : heads[1];
  const from = BigInt(fromBlock);
  const upperBound = toBlock === undefined ? commonHead : BigInt(toBlock);
  if (from > upperBound) throw new Error("Pool scan fromBlock must be at or below toBlock.");
  if (upperBound > commonHead) throw new Error("Pool scan toBlock is above the common RPC head.");
  if (upperBound - from + 1n > BigInt(maxBlocks)) {
    throw new Error(`Pool scan exceeds the ${maxBlocks}-block safety limit; scan a smaller explicit range.`);
  }

  let scannedTo = from - 1n;
  const found = new Map();
  while (scannedTo < upperBound) {
    const chunkFrom = scannedTo + 1n;
    const chunkTo = chunkFrom + BigInt(chunkSize) - 1n < upperBound
      ? chunkFrom + BigInt(chunkSize) - 1n
      : upperBound;

        const responses = await Promise.all(providers.map(async (provider) => {
      const allLogs = [];

      for (const currencies of currencyPairs) {
        const filter = {
          address: UNISWAP_V4_POOL_MANAGER,
          fromBlock: `0x${chunkFrom.toString(16)}`,
          toBlock: `0x${chunkTo.toString(16)}`,
          topics: [
            INITIALIZE_TOPIC,
            null,
            indexedAddressTopic(currencies[0]),
            indexedAddressTopic(currencies[1]),
          ],
        };

        let logs;
        try {
          logs = await rpcCall(
            provider.url,
            "eth_getLogs",
            [filter],
            fetchImpl,
          );
        } catch (error) {
          const detail = error instanceof Error
            ? error.message
            : "RPC request failed.";
          throw new Error(
            `${detail} Requested block range ${chunkFrom}-${chunkTo}.`,
          );
        }

        if (!Array.isArray(logs)) {
          throw new Error(
            `${provider.name} RPC returned invalid eth_getLogs data.`,
          );
        }

        allLogs.push(
          ...logs.map((log) =>
            decodeInitializeLog(log, currencies, chunkFrom, chunkTo)
          ),
        );
      }

      return allLogs;
    }));
    const normalizedResponses = responses.map((pools) =>
      [...pools].sort((a, b) => a.poolId.localeCompare(b.poolId))
    );

    if (
      JSON.stringify(normalizedResponses[0]) !==
      JSON.stringify(normalizedResponses[1])
    ) {
      throw new Error(
        `RPCs disagree on ETH/USDG or WETH/USDG Initialize logs in blocks ${chunkFrom}-${chunkTo}.`
      );
    }

    for (const pool of responses[0]) {
      const previous = found.get(pool.poolId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(pool)) {
        throw new Error(`Conflicting Initialize logs found for pool ${pool.poolId}.`);
      }
      found.set(pool.poolId, pool);
    }
    scannedTo = chunkTo;

    if (scannedTo < upperBound && chunkDelayMs > 0) {
      await sleep(chunkDelayMs);
    }
  }

  const pools = [...found.values()].sort((a, b) => {
    const blockOrder = BigInt(a.initializedAtBlock) - BigInt(b.initializedAtBlock);
    if (blockOrder !== 0n) return blockOrder < 0n ? -1 : 1;
    return BigInt(a.logIndex) < BigInt(b.logIndex) ? -1 : BigInt(a.logIndex) > BigInt(b.logIndex) ? 1 : 0;
  });
  return {
    currencyPairs: currencyPairs.map(([currency0, currency1]) => ({
    currency0,
    currency1,
  })),
    fromBlock: from.toString(),
    toBlock: scannedTo.toString(),
    scannedBlocks: (scannedTo - from + 1n).toString(),
    pools,
    note: "Initialize events identify pool keys only. Inspect current state and trade-size liquidity separately; this is not a quote.",
  };
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
  currency0,
  currency1,
  fetchImpl = fetch,
}) {
  if (!commonBlock || !/^\d+$/.test(String(commonBlock))) {
    throw new Error("A common block from verifyChain is required.");
  }

  const usd = validateAddress(usdgAddress);
  const weth = validateAddress(ROBINHOOD_WETH);

  // Kompatibilitas dengan pemanggilan lama:
  // jika keduanya tidak diberikan, default ke native ETH/USDG.
  if ((currency0 === undefined) !== (currency1 === undefined)) {
    throw new Error("Provide both currency0 and currency1.");
  }

  const sortCurrencies = (currencies) =>
    [...currencies].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );

  const suppliedPair = currency0 === undefined
    ? sortCurrencies([ZERO_ADDRESS, usd])
    : sortCurrencies([
        validateAddress(currency0),
        validateAddress(currency1),
      ]);

  const allowedPairs = [
    sortCurrencies([ZERO_ADDRESS, usd]),
    sortCurrencies([weth, usd]),
  ];

  const isAllowedPair = allowedPairs.some(
    ([allowed0, allowed1]) =>
      allowed0.toLowerCase() === suppliedPair[0].toLowerCase() &&
      allowed1.toLowerCase() === suppliedPair[1].toLowerCase(),
  );

  if (!isAllowedPair) {
    throw new Error(
      "Pool currencies must be native ETH/USDG or WETH/USDG.",
    );
  }

  const [poolCurrency0, poolCurrency1] = suppliedPair;

  const hooks = validatePoolKey({
    fee,
    tickSpacing,
    hooksAddress,
  });

  const poolKey = [
    { type: "address" },
    { type: "address" },
    { type: "uint24" },
    { type: "int24" },
    { type: "address" },
  ];
  const poolId = keccak256(encodeAbiParameters(poolKey, [
    poolCurrency0,
    poolCurrency1,
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
    { name: "primary", url: primaryUrl },
    { name: "secondary", url: secondaryUrl },
  ];

  const states = await Promise.all(providers.map(async (provider) => {
    const [chainIdRaw, managerCode, stateViewCode, slot0Raw, liquidityRaw, stateViewSlot0Raw, stateViewLiquidityRaw, hooksCode] = await Promise.all([
      rpcCall(provider.url, "eth_chainId", [], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [UNISWAP_V4_POOL_MANAGER, blockTag], fetchImpl),
      rpcCall(provider.url, "eth_getCode", [UNISWAP_V4_STATE_VIEW, blockTag], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_POOL_MANAGER, data: `${EXTSLOAD_SELECTOR}${stateSlot.slice(2)}` },
        blockTag,
      ], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_POOL_MANAGER, data: `${EXTSLOAD_SELECTOR}${liquiditySlot.slice(2)}` },
        blockTag,
      ], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_STATE_VIEW, data: `${STATE_VIEW_SLOT0_SELECTOR}${poolId.slice(2)}` },
        blockTag,
      ], fetchImpl),
      rpcCall(provider.url, "eth_call", [
        { to: UNISWAP_V4_STATE_VIEW, data: `${STATE_VIEW_LIQUIDITY_SELECTOR}${poolId.slice(2)}` },
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
    if (typeof stateViewCode !== "string" || !/^0x[0-9a-f]+$/i.test(stateViewCode) || stateViewCode.toLowerCase() === "0x") {
      throw new Error(`${provider.name} RPC has no Uniswap v4 StateView bytecode at the shared block.`);
    }
    if (hooks.hooksAddress.toLowerCase() !== "0x0000000000000000000000000000000000000000"
      && (typeof hooksCode !== "string" || !/^0x[0-9a-f]+$/i.test(hooksCode) || hooksCode.toLowerCase() === "0x")) {
      throw new Error(`${provider.name} RPC has no hooks contract bytecode at the shared block.`);
    }
    const state = decodePoolState(slot0Raw, liquidityRaw);
    if (typeof stateViewSlot0Raw !== "string" || !/^0x[0-9a-f]{256}$/i.test(stateViewSlot0Raw)
      || typeof stateViewLiquidityRaw !== "string" || !/^0x[0-9a-f]{64}$/i.test(stateViewLiquidityRaw)) {
      throw new Error(`${provider.name} RPC returned invalid StateView data.`);
    }
    const [viewSqrtPrice, viewTick, viewProtocolFee, viewLpFee] = decodeAbiParameters(
      [
        { type: "uint160" },
        { type: "int24" },
        { type: "uint24" },
        { type: "uint24" },
      ],
      stateViewSlot0Raw,
    );
    const viewLiquidity = decodeAbiParameters([{ type: "uint128" }], stateViewLiquidityRaw)[0];
    if (viewSqrtPrice !== state.sqrtPriceX96
      || BigInt(viewTick) !== state.tick
      || BigInt(viewProtocolFee) !== state.protocolFee
      || BigInt(viewLpFee) !== state.lpFee
      || viewLiquidity !== state.activeLiquidity) {
      throw new Error(`${provider.name} RPC StateView disagrees with PoolManager storage for pool ${poolId}.`);
    }
    return {
      managerCode: managerCode.toLowerCase(),
      stateViewCode: stateViewCode.toLowerCase(),
      hooksCode: hooksCode.toLowerCase(),
      state,
    };
  }));
  if (states[0].managerCode !== states[1].managerCode
    || states[0].stateViewCode !== states[1].stateViewCode
    || states[0].hooksCode !== states[1].hooksCode
    || JSON.stringify(Object.fromEntries(Object.entries(states[0].state).map(([key, value]) => [key, value.toString()])))
      !== JSON.stringify(Object.fromEntries(Object.entries(states[1].state).map(([key, value]) => [key, value.toString()])))) {
    throw new Error("RPCs disagree on PoolManager, hook, or pool state.");
  }

  const state = states[0].state;
  const initialized = state.sqrtPriceX96 !== 0n;
  return {
    poolId,
    currencies: { currency0, currency1 },
    fee: hooks.fee.toString(),
    tickSpacing: hooks.tickSpacing.toString(),
    hooks: hooks.hooksAddress,
    stateView: UNISWAP_V4_STATE_VIEW,
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
