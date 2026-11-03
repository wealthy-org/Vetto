
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseEther,
  parseUnits,
} from "viem";

import {
  buildUniversalRouterV4Swap,
  calculateMinOut,
} from "./universal-router-v4.mjs";

const RPC = process.env.ROBINHOOD_RPC_URL_PRIMARY;
const ROUTER = getAddress("0x204FAca1764B154221e35c0d20aBb3c525710498");
const QUOTER = getAddress("0x8dc178efb8111bb0973dd9d722ebeff267c98f94");
const USDG = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const PERMIT2 = getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3");
const ZERO = "0x0000000000000000000000000000000000000000";

const SLIPPAGE_BPS = 50n;
const DEADLINE_SECONDS = 120n;

const walletArg = process.argv[2];
const ethAmountArg = process.argv[3] ?? "0.01";
const usdgAmountArg = process.argv[4] ?? "20";

if (!RPC) throw new Error("ROBINHOOD_RPC_URL_PRIMARY is missing.");
if (!walletArg || !isAddress(walletArg)) {
  throw new Error(
    "Usage: node --env-file=.env.local scripts/simulate-router-v4.mjs <wallet-address> [ETH amount] [USDG amount]",
  );
}

const useEthStateOverride =
  process.env.VETTO_SIMULATE_WITH_STATE_OVERRIDE === "1";

const account = getAddress(walletArg);

const client = createPublicClient({
  transport: http(RPC, { timeout: 15_000, retryCount: 0 }),
});

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
];

const poolKey = {
  currency0: ZERO,
  currency1: USDG,
  fee: 500,
  tickSpacing: 10,
  hooks: ZERO,
};

// Router 2.1.2 on Robinhood Chain uses the six-field struct.
// minHopPriceX36 must be included, even when set to zero.
const exactInputSingleType = {
  type: "tuple",
  components: [
    {
      name: "poolKey",
      type: "tuple",
      components: poolKeyComponents,
    },
    { name: "zeroForOne", type: "bool" },
    { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" },
    { name: "minHopPriceX36", type: "uint256" },
    { name: "hookData", type: "bytes" },
  ],
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

const routerAbi = [{
  type: "function",
  name: "execute",
  stateMutability: "payable",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
}];

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const permit2Abi = [{
  type: "function",
  name: "allowance",
  stateMutability: "view",
  inputs: [
    { name: "user", type: "address" },
    { name: "token", type: "address" },
    { name: "spender", type: "address" },
  ],
  outputs: [
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
}];

function encodeSwap({
  zeroForOne,
  amountIn,
  minOut,
}) {
  const currencyIn = zeroForOne ? ZERO : USDG;
  const currencyOut = zeroForOne ? USDG : ZERO;

  const swapParams = encodeAbiParameters(
    [exactInputSingleType],
    [{
      poolKey,
      zeroForOne,
      amountIn,
      amountOutMinimum: minOut,
      minHopPriceX36: 0n,
      hookData: "0x",
    }],
  );

  const settleParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyIn, amountIn],
  );

  const takeParams = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [currencyOut, minOut],
  );

  // V4_SWAP = 0x10
  // SWAP_EXACT_IN_SINGLE = 0x06
  // SETTLE_ALL = 0x0c
  // TAKE_ALL = 0x0f
  const actions = "0x060c0f";

  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swapParams, settleParams, takeParams]],
  );

  const deadline =
    BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECONDS;

  const data = encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: ["0x10", [v4Input], deadline],
  });

  return {
    data,
    value: zeroForOne ? amountIn : 0n,
    deadline,
  };
}

async function assertContract(address, label) {
  const code = await client.getBytecode({ address });
  if (!code || code === "0x") {
    throw new Error(`${label} has no deployed bytecode at ${address}.`);
  }
}

async function quote(zeroForOne, amountIn) {
  const result = await client.readContract({
    address: QUOTER,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{
      poolKey,
      zeroForOne,
      exactAmount: amountIn,
      hookData: "0x",
    }],
  });

  const expectedOut = result[0];
  const gasEstimate = result[1];

  if (expectedOut <= 0n || gasEstimate <= 0n) {
    throw new Error("Quoter returned an invalid result.");
  }

  const minOut = calculateMinOut(expectedOut, SLIPPAGE_BPS);

  if (minOut <= 0n) {
    throw new Error("Minimum output is invalid.");
  }

  return { expectedOut, minOut, gasEstimate };
}

async function checkUsdgAllowance(amountIn) {
  const tokenAllowance = await client.readContract({
    address: USDG,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account, PERMIT2],
  });

  if (tokenAllowance < amountIn) {
    return {
      ok: false,
      reason: "USDG allowance to Permit2 is insufficient.",
    };
  }

  const [permitAmount, expiration] = await client.readContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [account, USDG, ROUTER],
  });

  const now = BigInt(Math.floor(Date.now() / 1000));

  if (permitAmount < amountIn) {
    return {
      ok: false,
      reason: "Permit2 allowance to Universal Router is insufficient.",
    };
  }

  if (expiration <= now) {
    return {
      ok: false,
      reason: "Permit2 allowance has expired.",
    };
  }

  return { ok: true };
}

async function simulate({ label, zeroForOne, amountIn }) {
  console.log(`\n=== ${label} ===`);

  const inputBalance = zeroForOne
    ? await client.getBalance({ address: account })
    : await client.readContract({
        address: USDG,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });

  if (
    inputBalance < amountIn &&
    !(zeroForOne && useEthStateOverride)
  ) {
    console.log("SKIPPED: Insufficient input-token balance.");
    return;
  }

  if (!zeroForOne) {
    const allowance = await checkUsdgAllowance(amountIn);
    if (!allowance.ok) {
      console.log(`SKIPPED: ${allowance.reason}`);
      return;
    }
  }

  const { expectedOut, minOut, gasEstimate } =
    await quote(zeroForOne, amountIn);

  const outputDecimals = zeroForOne ? 6 : 18;
  const outputSymbol = zeroForOne ? "USDG" : "ETH";

  const tx = buildUniversalRouterV4Swap({
    zeroForOne,
    amountIn,
    minOut,
    deadline: BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECONDS,
  });

  console.log("Amount in:", formatUnits(amountIn, zeroForOne ? 18 : 6));
  console.log(
    "Expected out:",
    formatUnits(expectedOut, outputDecimals),
    outputSymbol,
  );
  console.log(
    "Minimum out:",
    formatUnits(minOut, outputDecimals),
    outputSymbol,
  );
  console.log("Quoter gas estimate:", gasEstimate.toString());
  console.log("Calldata length:", (tx.data.length - 2) / 2, "bytes");

  if (zeroForOne && useEthStateOverride) {
    console.log("Using temporary ETH balance override for eth_call only.");
  }

  const result = await client.call({
    account,
    to: ROUTER,
    data: tx.data,
    value: tx.value,
    ...(zeroForOne && useEthStateOverride
      ? {
          stateOverride: [
            {
              address: account,
              balance: inputBalance + amountIn + parseEther("1"),
            },
          ],
        }
      : {}),
  });

  console.log("SIMULATION PASSED");
  console.log("Return data:", result.data ?? "0x");
  console.log("Transaction broadcast: NO");
}

async function main() {
  const chainId = await client.getChainId();

  if (chainId !== 4663) {
    throw new Error(`Wrong chain ID: ${chainId}; expected 4663.`);
  }

  const configuredUsdg = process.env.ROBINHOOD_USDG_ADDRESS;
  if (
    !configuredUsdg ||
    getAddress(configuredUsdg) !== USDG
  ) {
    throw new Error("ROBINHOOD_USDG_ADDRESS does not match verified USDG.");
  }

  console.log("Chain ID:", chainId);
  console.log("Wallet:", account);
  console.log("Router:", ROUTER);

  await assertContract(ROUTER, "Universal Router");
  await assertContract(QUOTER, "Quoter");

  const ethAmount = parseEther(ethAmountArg);
  const usdgAmount = parseUnits(usdgAmountArg, 6);

  let failures = 0;

  try {
    await simulate({
      label: "ETH -> USDG",
      zeroForOne: true,
      amountIn: ethAmount,
    });
  } catch (error) {
    failures++;
    console.error(
      "ETH -> USDG simulation failed:",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    await assertContract(PERMIT2, "Permit2");
    await simulate({
      label: "USDG -> ETH",
      zeroForOne: false,
      amountIn: usdgAmount,
    });
  } catch (error) {
    failures++;
    console.error(
      "USDG -> ETH simulation failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (failures > 0) {
    process.exitCode = 1;
  }

  console.log("\nSimulation process finished. No transaction was sent.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
