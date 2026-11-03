
import type { QuoteRequest, RouteQuote } from "./types.ts";

const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_UINT256_DIGITS = 78;
const MAX_PRICE_IMPACT_BPS = 10_000;
const MAX_LATENCY_MS = 120_000;
const MAX_ROUTES = 5;

const big = (value: unknown): bigint | null => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_UINT256_DIGITS ||
    !/^\d+$/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = BigInt(value);
    return parsed <= MAX_UINT256 ? parsed : null;
  } catch {
    return null;
  }
};

const isNonEmptyString = (value: unknown, max = 256): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max;

function validOptionalMetric(value: unknown, max: number): boolean {
  return value === undefined || (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

/** Reject malformed, mismatched, expired, or incoherent quotes. */
export function isValidQuote(
  q: RouteQuote,
  req: QuoteRequest,
  now: number,
  allowNonExecutable = false,
): boolean {
  if (!q || typeof q !== "object") return false;
  if (!req || typeof req !== "object") return false;
  if (!Number.isFinite(now)) return false;

  if (typeof q.isExecutable !== "boolean") return false;
  if (!q.isExecutable && !allowNonExecutable) return false;

  if (
    !isNonEmptyString(q.quoteId, 128) ||
    !isNonEmptyString(q.provider) ||
    !isNonEmptyString(q.executionPathId, 256)
  ) {
    return false;
  }

  if (
    !["direct", "split", "solver", "private", "rfq"].includes(q.routeType)
  ) {
    return false;
  }

  if (q.tokenIn !== req.tokenIn || q.tokenOut !== req.tokenOut) {
    return false;
  }

  if (
    !isNonEmptyString(req.tokenIn, 10) ||
    !isNonEmptyString(req.tokenOut, 10) ||
    req.tokenIn === req.tokenOut ||
    q.amountInBaseUnits !== req.amountInBaseUnits
  ) {
    return false;
  }

  const amountIn = big(req.amountInBaseUnits);
  const expected = big(q.expectedOutBaseUnits);
  const min = big(q.minOutBaseUnits);

  if (
    amountIn === null ||
    expected === null ||
    min === null ||
    amountIn <= 0n ||
    expected <= 0n ||
    min <= 0n ||
    min > expected
  ) {
    return false;
  }

  if (typeof q.feeEstimatesAvailable !== "boolean") {
    return false;
  }

  if (q.feeEstimatesAvailable) {
    const network = big(q.networkFeeEstimate);
    const protocol = big(q.protocolFeeEstimate);

    if (
      network === null ||
      protocol === null ||
      network > expected ||
      protocol > expected - network
    ) {
      return false;
    }
  } else if (
    q.networkFeeEstimate !== null ||
    q.protocolFeeEstimate !== null
  ) {
    return false;
  }

  if (
    !validOptionalMetric(q.priceImpactBps, MAX_PRICE_IMPACT_BPS) ||
    !validOptionalMetric(q.latencyMs, MAX_LATENCY_MS)
  ) {
    return false;
  }

  if (
    q.verifiedPrivacyRelay !== undefined &&
    typeof q.verifiedPrivacyRelay !== "boolean"
  ) {
    return false;
  }

  if (
    req.privateRequested &&
    (q.routeType !== "private" || q.verifiedPrivacyRelay !== true)
  ) {
    return false;
  }

  if (typeof q.executableUntil !== "string") return false;

  const until = Date.parse(q.executableUntil);
  return Number.isFinite(until) && until > now;
}

const grossOut = (q: RouteQuote): bigint =>
  BigInt(q.expectedOutBaseUnits);

const netOut = (q: RouteQuote): bigint => {
  // Called only when every candidate has verified fee estimates.
  return (
    grossOut(q) -
    BigInt(q.networkFeeEstimate!) -
    BigInt(q.protocolFeeEstimate!)
  );
};

/**
 * Uses net output only if every valid candidate has verified fee estimates.
 * Otherwise compares gross output consistently for all candidates.
 */
export function rankQuotes(
  quotes: RouteQuote[],
  req: QuoteRequest,
  now = Date.now(),
  max = MAX_ROUTES,
  allowNonExecutable = false,
): RouteQuote[] {
  if (
    !Array.isArray(quotes) ||
    !Number.isFinite(now) ||
    !Number.isInteger(max) ||
    max < 0
  ) {
    return [];
  }

  const limit = Math.min(max, MAX_ROUTES);

  const valid = quotes.filter((q) =>
    isValidQuote(q, req, now, allowNonExecutable)
  );

  const compareNet = valid.every((q) => q.feeEstimatesAvailable);

  return valid
    .sort((a, b) => {
      const difference = compareNet
        ? netOut(b) - netOut(a)
        : grossOut(b) - grossOut(a);

      if (difference !== 0n) {
        return difference > 0n ? 1 : -1;
      }

      return (
        (a.priceImpactBps ?? 0) - (b.priceImpactBps ?? 0) ||
        (a.latencyMs ?? 0) - (b.latencyMs ?? 0)
      );
    })
    .slice(0, limit);
}
