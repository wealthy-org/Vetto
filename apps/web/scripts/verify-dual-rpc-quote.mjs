import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  parseEther,
} from "viem";

const CHAIN_ID = 4663;
const ROUTER = getAddress(
  "0x204FAca1764B154221e35c0d20aBb3c525710498",
);
const QUOTER = getAddress(
  "0x8dc178efb8111bb0973dd9d722ebeFF267c98f94",
);
const PERMIT2 = getAddress(
  "0x000000000022D473030F116dDEE9F6B43aC78BA3",
);
const USDG_EXPECTED = getAddress(
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
);
const ZERO = "0x0000000000000000000000000000000000000000";

const FEE = 500;
const TICK_SPACING = 10;
const HOOKS = ZERO;

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
];

const poolKey = {
  currency0: ZERO,
  currency1: USDG_EXPECTED,
  fee: FEE,
  tickSpacing: TICK_SPACING,
  hooks: HOOKS,
};

const quoterAbi = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: poolKeyComponents,
      },
      { name: "zeroForOne", type: "bool" },
      { name: "exactAmount", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "gasEstimate", type: "uint256" },
  ],
}];

function validateEndpoint(raw, label) {
  if (!raw) throw new Error(`${label} is missing.`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  const loopback = [
    "localhost",
    "127.0.0.1",
    "[::1]",
  ].includes(url.hostname);

  if (
    (url.protocol !== "https:" &&
      !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `${label} must use HTTPS and must not contain URL credentials.`,
    );
  }

  return url;
}

function createClient(url) {
  return createPublicClient({
    transport: http(url.toString(), {
      timeout: 15_000,
      retryCount: 0,
    }),
  });
}

async function verifyProvider(provider) {
  const chainId = await provider.client.getChainId();

  if (chainId !== CHAIN_ID) {
    throw new Error(
      `${provider.name} has chain ID ${chainId}; expected ${CHAIN_ID}.`,
    );
  }

  const blockNumber = await provider.client.getBlockNumber();

  return { ...provider, blockNumber };
}

async function verifyBlock(provider, commonBlock) {
  const block = await provider.client.getBlock({
    blockNumber: commonBlock,
  });

  if (!block.hash) {
    throw new Error(
      `${provider.name} returned no block hash at ${commonBlock}.`,
    );
  }

  return block.hash;
}

async function getVerifiedCode(provider, address, label, commonBlock) {
  const code = await provider.client.getBytecode({
    address,
    blockNumber: commonBlock,
  });

  if (!code || code === "0x") {
    throw new Error(
      `${provider.name}: ${label} has no bytecode at common block.`,
    );
  }

  return code.toLowerCase();
}

async function verifyBytecode(providers, commonBlock) {
  const contracts = [
    ["Universal Router", ROUTER],
    ["Quoter", QUOTER],
    ["Permit2", PERMIT2],
    ["USDG", USDG_EXPECTED],
  ];

  const results = await Promise.all(
    contracts.map(async ([label, address]) => {
      const codes = await Promise.all(
        providers.map((provider) =>
          getVerifiedCode(provider, address, label, commonBlock),
        ),
      );

      if (codes[0] !== codes[1]) {
        throw new Error(
          `RPCs disagree on ${label} bytecode at common block.`,
        );
      }

      return { contract: label, match: true };
    }),
  );

  return results;
}

async function getQuote(provider, amountIn, commonBlock) {
  const data = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{
      poolKey,
      zeroForOne: true,
      exactAmount: amountIn,
      hookData: "0x",
    }],
  });

  const result = await provider.client.call({
    to: QUOTER,
    data,
    blockNumber: commonBlock,
  });

  if (!result.data) {
    throw new Error(`${provider.name} Quoter returned empty data.`);
  }

  const [expectedOut, gasEstimate] = decodeFunctionResult({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    data: result.data,
  });

  if (expectedOut <= 0n || gasEstimate <= 0n) {
    throw new Error(`${provider.name} returned an invalid quote.`);
  }

  return { expectedOut, gasEstimate };
}

async function main() {
  const primaryUrl = validateEndpoint(
    process.env.ROBINHOOD_RPC_URL_PRIMARY,
    "Primary RPC",
  );

  const secondaryUrl = validateEndpoint(
    process.env.ROBINHOOD_RPC_URL_SECONDARY,
    "Secondary RPC",
  );

  if (primaryUrl.origin === secondaryUrl.origin) {
    throw new Error("Primary and secondary RPCs must use different origins.");
  }

  const configuredUsdg = process.env.ROBINHOOD_USDG_ADDRESS;

  if (!configuredUsdg || getAddress(configuredUsdg) !== USDG_EXPECTED) {
    throw new Error(
      "ROBINHOOD_USDG_ADDRESS does not match the verified USDG address.",
    );
  }

  const amountArg = process.argv[2] ?? "0.01";

  if (!/^\d+(\.\d{1,18})?$/.test(amountArg)) {
    throw new Error("ETH amount must be a positive decimal with at most 18 decimals.");
  }

  const amountIn = parseEther(amountArg);

  if (amountIn <= 0n || amountIn >= 1n << 128n) {
    throw new Error("ETH amount must fit a positive uint128 value.");
  }

  const providers = [
    {
      name: "primary",
      url: primaryUrl,
      client: createClient(primaryUrl),
    },
    {
      name: "secondary",
      url: secondaryUrl,
      client: createClient(secondaryUrl),
    },
  ];

  const heads = await Promise.all(
    providers.map(verifyProvider),
  );

  const commonBlock = heads.reduce(
    (lowest, provider) =>
      provider.blockNumber < lowest
        ? provider.blockNumber
        : lowest,
    heads[0].blockNumber,
  );

  const blockHashes = await Promise.all(
    heads.map((provider) => verifyBlock(provider, commonBlock)),
  );

  if (blockHashes[0] !== blockHashes[1]) {
    throw new Error("RPCs disagree on the common block hash.");
  }

  const bytecode = await verifyBytecode(providers, commonBlock);

  const quotes = await Promise.all(
    providers.map((provider) =>
      getQuote(provider, amountIn, commonBlock),
    ),
  );

  if (
    quotes[0].expectedOut !== quotes[1].expectedOut ||
    quotes[0].gasEstimate !== quotes[1].gasEstimate
  ) {
    throw new Error("RPCs disagree on the Quoter result.");
  }

  console.log(JSON.stringify({
    status: "PASSED",
    chainId: CHAIN_ID,
    providers: heads.map((provider) => ({
      name: provider.name,
      host: provider.url.host,
      headBlock: provider.blockNumber.toString(),
    })),
    commonBlock: commonBlock.toString(),
    commonBlockHash: blockHashes[0],
    bytecode,
    pool: {
      fee: FEE,
      tickSpacing: TICK_SPACING,
      hooks: HOOKS,
    },
    quote: {
      direction: "ETH -> USDG",
      amountIn: amountArg,
      expectedOut: quotes[0].expectedOut.toString(),
      expectedOutFormatted: formatUnits(
        quotes[0].expectedOut,
        6,
      ),
      gasEstimate: quotes[0].gasEstimate.toString(),
      quoteMatch: true,
    },
    transactionBroadcast: false,
    note: "Read-only dual RPC Quoter verification. No wallet balance, allowance, Router execution, signature, or transaction was used.",
  }, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Dual RPC quote verification failed.",
  );
  process.exitCode = 1;
});