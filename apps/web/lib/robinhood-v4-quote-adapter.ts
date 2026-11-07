import { decodeFunctionResult, encodeFunctionData, getAddress } from "viem";

import type { QuoteAdapter, RouteQuote } from "@vetto/quote-engine";

import {
  CONTRACTS,
  NATIVE_ETH,
  POOL_VENUES,
  ROBINHOOD_CHAIN_ID,
  USDG,
  rpcClient,
  rpcUrls,
  swapExecutionEnabled,
  V4_QUOTER_QUOTE_ABI,
  type PoolVenue,
} from "./robinhood-chain";
import { serverProfile, type ProfileAsset } from "./chain-profile";

function profileAssets(): readonly ProfileAsset[] {
  return serverProfile().assets;
}
import { fingerprintQuote } from "./quote-fingerprint";

/**
 * Real Uniswap v4 quotes on Robinhood Chain.
 *
 * One adapter, several registered pools. Every returned route corresponds to an
 * actual `quoteExactInputSingle` call against a pool key that answered without
 * reverting; nothing is interpolated or cached from a previous session. When a
 * pool refuses to quote it is reported as skipped instead of being invented.
 *
 * `isExecutable` is only true when the deployment has opted into swap execution
 * (see swapExecutionEnabled) — a quote can be live and still not be executable.
 */

/**
 * Pairs come from the active chain profile's registered pools, not from a
 * hardcoded list: mainnet quotes ETH/USDG, testnet quotes ETH/HUNT and
 * ETH/DUCK, and neither can quote a pair it has no pool for.
 */
const SUPPORTED_PAIRS = new Set(
  POOL_VENUES.flatMap((venue) => {
    const symbol = assetSymbolFor(venue.poolKey.currency1);
    return symbol ? [`ETH/${symbol}`, `${symbol}/ETH`] : [];
  }),
);

/** Reference trade used to derive a spot-ish rate from real quotes (10 bps of size). */
const REFERENCE_DIVISOR = 1000n;

function assetSymbolFor(address: string): string | undefined {
  const target = address.toLowerCase();
  return profileAssets().find((asset) => asset.address !== "native" && asset.address.toLowerCase() === target)?.symbol;
}

function isSupportedPair(tokenIn: string, tokenOut: string): boolean {
  const a = tokenIn.toUpperCase();
  const b = tokenOut.toUpperCase();
  if (a === b) return false;
  return SUPPORTED_PAIRS.has(`${a}/${b}`);
}

interface VenueQuote {
  venue: PoolVenue;
  amountOut: bigint;
  gasEstimate: bigint;
  referenceOut: bigint;
}

async function quoteVenue(
  client: ReturnType<typeof rpcClient>,
  venue: PoolVenue,
  zeroForOne: boolean,
  amountIn: bigint,
): Promise<VenueQuote> {
  const referenceInput = amountIn / REFERENCE_DIVISOR > 0n ? amountIn / REFERENCE_DIVISOR : 1n;

  const call = (amount: bigint) =>
    client
      .call({
        to: CONTRACTS.v4Quoter,
        data: encodeFunctionData({
          abi: V4_QUOTER_QUOTE_ABI,
          functionName: "quoteExactInputSingle",
          args: [{ poolKey: venue.poolKey, zeroForOne, exactAmount: amount, hookData: "0x" }],
        }),
      })
      .then((result) =>
        decodeFunctionResult({
          abi: V4_QUOTER_QUOTE_ABI,
          functionName: "quoteExactInputSingle",
          data: result.data ?? "0x",
        }),
      );

  const [result, reference] = await Promise.all([call(amountIn), call(referenceInput)]);

  const [amountOut, gasEstimate] = result;
  const [referenceOut] = reference;

  if (amountOut <= 0n || gasEstimate <= 0n) {
    throw new Error(`${venue.id}: quoter returned an empty result`);
  }

  return { venue, amountOut, gasEstimate, referenceOut };
}

function priceImpactBps(quote: VenueQuote, amountIn: bigint): number | undefined {
  if (quote.referenceOut <= 0n) return undefined;
  const referenceInput = amountIn / REFERENCE_DIVISOR > 0n ? amountIn / REFERENCE_DIVISOR : 1n;
  // rateNow vs rateReference, both in base units of tokenOut per tokenIn.
  const nowScaled = quote.amountOut * referenceInput;
  const refScaled = quote.referenceOut * amountIn;
  if (refScaled <= 0n) return undefined;
  if (nowScaled >= refScaled) return 0;
  const bps = Number(((refScaled - nowScaled) * 10_000n) / refScaled);
  return Number.isFinite(bps) ? bps : undefined;
}

export const robinhoodV4QuoteAdapter: QuoteAdapter = {
  id: "robinhood-uniswap-v4",
  status: "verified",

  async quote(req, signal): Promise<RouteQuote[]> {
    if (signal.aborted) return [];
    if (req.chainId !== ROBINHOOD_CHAIN_ID) return [];

    // Private submission has no verified relay on this chain: never fake it.
    if (req.privateRequested) return [];

    if (!isSupportedPair(req.tokenIn, req.tokenOut)) return [];

    if (!Number.isInteger(req.slippageBps) || req.slippageBps < 0 || req.slippageBps >= 10_000) {
      throw new Error("Invalid slippage.");
    }

    let amountIn: bigint;
    try {
      amountIn = BigInt(req.amountInBaseUnits);
    } catch {
      throw new Error("Invalid input amount.");
    }

    if (amountIn <= 0n || amountIn >= 1n << 128n) {
      throw new Error("Input amount is outside uint128 range.");
    }

    const zeroForOne = req.tokenIn.toUpperCase() === "ETH";
    // The non-ETH leg is whichever asset this chain profile registers pools for.
    const otherSymbol = req.tokenIn.toUpperCase() === "ETH" ? req.tokenOut : req.tokenIn;
    const otherAddress = USDG.address;
    const tokenInSymbol = zeroForOne ? "ETH" : otherSymbol;
    const tokenOutSymbol = zeroForOne ? otherSymbol : "ETH";
    const tokenInAddress = zeroForOne ? NATIVE_ETH.address : otherAddress;
    const tokenOutAddress = zeroForOne ? otherAddress : NATIVE_ETH.address;

    // Only pools for *this* pair: on a chain with several tokens a venue for a
    // different currency1 is a different trade, not an alternative route.
    const venues = POOL_VENUES.filter(
      (venue) => assetSymbolFor(venue.poolKey.currency1) === otherSymbol,
    );

    const { primary } = rpcUrls();
    const client = rpcClient(primary, 8000);
    const started = Date.now();

    const settled = await Promise.allSettled(
      venues.map((venue) => quoteVenue(client, venue, zeroForOne, amountIn)),
    );

    if (signal.aborted) return [];

    const usable = settled.filter(
      (entry): entry is PromiseFulfilledResult<VenueQuote> => entry.status === "fulfilled",
    );

    if (usable.length === 0) {
      const reasons = settled
        .map((entry) => (entry.status === "rejected" ? String(entry.reason?.message ?? entry.reason) : ""))
        .filter(Boolean)
        .join("; ");
      throw new Error(`No pool answered a quote for this trade. ${reasons}`.slice(0, 300));
    }

    let gasPriceWei = 0n;
    try {
      gasPriceWei = await client.getGasPrice();
    } catch {
      gasPriceWei = 0n;
    }

    const executable = swapExecutionEnabled();
    const now = Date.now();
    const slippage = BigInt(req.slippageBps);

    return usable.map(({ value }) => {
      const { venue, amountOut, gasEstimate } = value;
      const minOut = (amountOut * (10_000n - slippage)) / 10_000n;
      if (minOut <= 0n) {
        throw new Error(`${venue.id}: minimum received rounds to zero`);
      }

      // Convert the gas estimate into tokenOut base units using this pool's own
      // reference rate. Estimates only: the router's real gas usage is measured
      // during simulation and shown again in the receipt.
      const gasCostWei = gasPriceWei > 0n ? gasEstimate * gasPriceWei : 0n;
      let networkFee = 0n;
      if (gasCostWei > 0n) {
        if (zeroForOne) {
          const referenceInput =
            amountIn / REFERENCE_DIVISOR > 0n ? amountIn / REFERENCE_DIVISOR : 1n;
          networkFee =
            value.referenceOut > 0n
              ? (gasCostWei * value.referenceOut) / referenceInput
              : 0n;
        } else {
          networkFee = gasCostWei;
        }
      }

      const f = fingerprintQuote({
        chainId: ROBINHOOD_CHAIN_ID,
        venueId: venue.id,
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountInBaseUnits: amountIn.toString(),
        minOutBaseUnits: minOut.toString(),
        slippageBps: req.slippageBps,
        router: CONTRACTS.universalRouter.toLowerCase(),
      });

      return {
        quoteId: `${venue.id}-${now}-${f.slice(0, 8)}`,
        routeType: "direct",
        provider: venue.label,
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountInBaseUnits: amountIn.toString(),
        expectedOutBaseUnits: amountOut.toString(),
        minOutBaseUnits: minOut.toString(),
        feeEstimatesAvailable: gasCostWei > 0n,
        networkFeeEstimate: gasCostWei > 0n ? networkFee.toString() : null,
        protocolFeeEstimate: gasCostWei > 0n ? "0" : null,
        priceImpactBps: priceImpactBps(value, amountIn),
        executableUntil: new Date(now + 15_000).toISOString(),
        executionPathId: venue.id,
        isExecutable: executable,
        latencyMs: Date.now() - started,
        tokenInAddress,
        tokenOutAddress,
        venueId: venue.id,
        venueFeeBps: venue.poolKey.fee === 100 ? 1 : venue.poolKey.fee / 100,
        gasUnits: gasEstimate.toString(),
        gasCostWei: gasCostWei.toString(),
        crossChecked: false,
        quoteFingerprint: f,
      } satisfies RouteQuote;
    });
  },
};

/** Exposed for tests: the exact pair gate used by the adapter. */
export const isSupportedPairForTest = isSupportedPair;
