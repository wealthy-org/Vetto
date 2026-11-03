
import {
  createPublicClient,
  getAddress,
  http,
} from "viem";
import type {
  QuoteAdapter,
  RouteQuote,
} from "@vetto/quote-engine";

const RPC = process.env.ROBINHOOD_RPC_URL_PRIMARY;
const USDG = process.env.ROBINHOOD_USDG_ADDRESS;

const QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
const ZERO = "0x0000000000000000000000000000000000000000";
const USDG_VERIFIED = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

const ABI = [{
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
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
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
}] as const;

const client = RPC
  ? createPublicClient({
      transport: http(RPC, { timeout: 8000, retryCount: 0 }),
    })
  : null;

export const robinhoodV4QuoteAdapter: QuoteAdapter = {
  id: "robinhood-uniswap-v4",
  status: "verified",

  async quote(req, signal): Promise<RouteQuote[]> {
    if (!client || !USDG) {
      throw new Error("Robinhood RPC configuration is missing.");
    }

    if (signal.aborted || req.chainId !== 4663) return [];
    if (req.privateRequested) return [];

    const tokenIn = req.tokenIn.toUpperCase();
    const tokenOut = req.tokenOut.toUpperCase();

    if (!(
      (tokenIn === "ETH" && tokenOut === "USDG") ||
      (tokenIn === "USDG" && tokenOut === "ETH")
    )) return [];

    if (getAddress(USDG) !== getAddress(USDG_VERIFIED)) {
      throw new Error("USDG address does not match verified token.");
    }

    const chainId = await client.getChainId();
    if (chainId !== 4663) {
      throw new Error(`Unexpected chain ID: ${chainId}`);
    }

    const amountIn = BigInt(req.amountInBaseUnits);
    if (amountIn <= 0n) return [];

    const zeroForOne = tokenIn === "ETH";
    const slippage = BigInt(req.slippageBps);

    if (slippage < 0n || slippage >= 10000n) {
      throw new Error("Invalid slippage.");
    }

    const started = Date.now();

    const [result, gasPrice] = await Promise.all([
      client.readContract({
        address: QUOTER,
        abi: ABI,
        functionName: "quoteExactInputSingle",
        args: [{
          poolKey: {
            currency0: ZERO,
            currency1: getAddress(USDG),
            fee: 500,
            tickSpacing: 10,
            hooks: ZERO,
          },
          zeroForOne,
          exactAmount: amountIn,
          hookData: "0x",
        }],
      }),
      client.getGasPrice(),
    ]);

    if (signal.aborted) return [];

    const quoteResult = result as readonly [bigint, bigint];

    const expectedOut: bigint = quoteResult[0];
    const gasEstimate: bigint = quoteResult[1];

    if (expectedOut <= 0n || gasEstimate <= 0n) return [];

    const gasCostWei = gasEstimate * gasPrice;

    // Convert estimated network fee into output-token base units.
    const networkFee = zeroForOne
      ? (gasCostWei * expectedOut) / amountIn
      : gasCostWei;

    const minOut =
      (expectedOut * (10000n - slippage)) / 10000n;

    if (minOut <= 0n) return [];

    const now = Date.now();
    

    return [{
      quoteId: `rh-v4-${now}`,
      routeType: "direct",
      provider: "Uniswap v4 - Robinhood Chain",
      tokenIn,
      tokenOut,
      amountInBaseUnits: amountIn.toString(),
      expectedOutBaseUnits: expectedOut.toString(),
      minOutBaseUnits: minOut.toString(),
      networkFeeEstimate: networkFee.toString(),
      protocolFeeEstimate: "0",
      executableUntil: new Date(now + 15000).toISOString(),
      executionPathId: `rh-v4-eth-usdg-${zeroForOne ? "forward" : "reverse"}`,
      // Quote is real, but router execution has not yet been verified.
      isExecutable: false,
      latencyMs: Date.now() - started,
    }];
  },
};
