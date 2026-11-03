import type { QuoteRequest, RouteQuote } from "./types.ts";

const big = (s: string): bigint | null => (/^\d+$/.test(s) ? BigInt(s) : null);

/** Reject anything that isn't a coherent, unexpired, executable answer to *this* request. */
export function isValidQuote(
  q: RouteQuote,
  req: QuoteRequest,
  now: number,
  allowNonExecutable = false,
): boolean {
  if (!q.isExecutable && !allowNonExecutable) return false;

  if (q.tokenIn !== req.tokenIn || q.tokenOut !== req.tokenOut) return false;
  if (q.amountInBaseUnits !== req.amountInBaseUnits) return false;

  const expected = big(q.expectedOutBaseUnits);
  const min = big(q.minOutBaseUnits);
  const net = big(q.networkFeeEstimate);
  const proto = big(q.protocolFeeEstimate);

  if (expected === null || min === null || net === null || proto === null) return false;
  if (expected <= 0n || min <= 0n || min > expected) return false;
  if (net > expected || proto > expected - net) return false;

  const until = Date.parse(q.executableUntil);
  return Number.isFinite(until) && until > now;
}

const netOut = (q: RouteQuote) => BigInt(q.expectedOutBaseUnits) - BigInt(q.networkFeeEstimate) - BigInt(q.protocolFeeEstimate);

/** Best net output first. Ties: lower price impact, then lower latency. Never more than `max` routes. */
export function rankQuotes(
  quotes: RouteQuote[],
  req: QuoteRequest,
  now = Date.now(),
  max = 5,
  allowNonExecutable = false,
): RouteQuote[] {
  return quotes
    .filter((q) => isValidQuote(q, req, now, allowNonExecutable))
    .sort((a, b) => {
      const d = netOut(b) - netOut(a);
      if (d !== 0n) return d > 0n ? 1 : -1;
      return (a.priceImpactBps ?? 0) - (b.priceImpactBps ?? 0) || (a.latencyMs ?? 0) - (b.latencyMs ?? 0);
    })
    .slice(0, max);
}
