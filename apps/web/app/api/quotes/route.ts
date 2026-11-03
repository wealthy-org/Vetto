import { auditFor } from "@/lib/audit-request";
import { findAsset, isExecutableAsset, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { parseDecimal, validateIntent, IntentValidationError } from "@vetto/intent-parser";
import { collectQuotes, type QuoteAdapter } from "@vetto/quote-engine";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { robinhoodV4QuoteAdapter } from "@/lib/robinhood-v4-quote-adapter";

export const runtime = "nodejs";

const DEMO_QUOTES = (process.env.VETTO_DEMO_QUOTES ?? "").toLowerCase() === "true";

/**
 * Local-only demo route for UI review. This is intentionally off in production and never represents a
 * verified market quote. It only exists so the review flow can be exercised without claiming a live pool.
 */
const DEMO_ADAPTER: readonly QuoteAdapter[] = DEMO_QUOTES ? [{
  id: "local-demo-route",
  status: "verified",
  async quote(req) {
    if (req.chainId !== ROBINHOOD_CHAIN_ID || req.privateRequested) return [];
    if ((req.tokenIn === "ETH" && req.tokenOut === "USDG") || (req.tokenIn === "USDG" && req.tokenOut === "ETH")) {
      const amountIn = BigInt(req.amountInBaseUnits);
      const displayRate = 3000n;
      const inDecimals = req.tokenIn === "ETH" ? 18n : 6n;
      const outDecimals = req.tokenIn === "ETH" ? 6n : 18n;
      const exactOut = req.tokenIn === "ETH"
        ? (amountIn * displayRate * 10n ** outDecimals) / 10n ** inDecimals
        : (amountIn * 10n ** outDecimals) / (displayRate * 10n ** inDecimals / 10n ** outDecimals);
      const minOut = exactOut;
      const now = Date.now();
      return [{
        quoteId: `demo-${req.tokenIn}-${req.tokenOut}-${now}`,
        routeType: "direct",
        provider: "local-demo",
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        amountInBaseUnits: req.amountInBaseUnits,
        expectedOutBaseUnits: exactOut.toString(),
        minOutBaseUnits: minOut.toString(),
        networkFeeEstimate: "0",
        protocolFeeEstimate: "0",
        priceImpactBps: 10,
        executableUntil: new Date(now + 60_000).toISOString(),
        executionPathId: `demo-${req.tokenIn.toLowerCase()}-${req.tokenOut.toLowerCase()}`,
        isExecutable: true,
        latencyMs: 12,
      }];
    }
    return [];
  },
}] : [];

/**
 * Register real, verified adapters here (e.g. a Uniswap v4 direct-pool adapter) once Phase 0
 * confirms pools and addresses. Until then the list is empty and the API says so honestly.
 */
const ADAPTERS: readonly QuoteAdapter[] = [
  robinhoodV4QuoteAdapter,
];

export async function POST(req: Request) {
  const g = await guardJson(req, "quotes", 20);
  if ("res" in g) return g.res;
  if (!isRecord(g.body)) return jsonError(400, "Expected { intent }.");

  let intent;
  try { intent = validateIntent(g.body.intent); } catch (e) {
    return jsonError(400, e instanceof IntentValidationError ? e.message : "Invalid intent.");
  }
  if (intent.kind !== "swap") return jsonError(400, "Only swap intents can be quoted.");

  const tIn = findAsset(intent.tokenIn);
  const tOut = findAsset(intent.tokenOut);
  if (!tIn || !tOut) return jsonError(422, "Unknown asset.");

  const result = await collectQuotes(
    {
      chainId: intent.chainId, tokenIn: tIn.symbol, tokenOut: tOut.symbol,
      amountInBaseUnits: parseDecimal(intent.amountIn, tIn.decimals).toString(),
      slippageBps: intent.slippageBps ?? 50, privateRequested: intent.privateRequested,
    },
    ADAPTERS,
  );
  await auditFor(req, { action: "quotes.request", intentKind: "swap", decision: result.routes.length ? "routes" : "none" });
  return jsonOk({
    ...result,
    ...(DEMO_QUOTES ? { message: result.routes.length ? "Demo quote is enabled locally only; it is not a live market quote." : "Demo quote mode is enabled locally only, and no executable route was produced." } : {}),
  });
}
