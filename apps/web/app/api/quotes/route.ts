import { auditFor } from "@/lib/audit-request";
import { findAsset, isExecutableAsset } from "@vetto/asset-registry";
import { parseDecimal, validateIntent, IntentValidationError } from "@vetto/intent-parser";
import { collectQuotes, type QuoteAdapter } from "@vetto/quote-engine";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Register real, verified adapters here (e.g. a Uniswap v4 direct-pool adapter) once Phase 0
 * confirms pools and addresses. Until then the list is empty and the API says so honestly.
 */
const ADAPTERS: readonly QuoteAdapter[] = [];

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

  if (!isExecutableAsset(tIn) || !isExecutableAsset(tOut)) {
    await auditFor(req, { action: "quotes.request", intentKind: "swap", decision: "assets-unverified" });
    return jsonOk({
      routes: [], skipped: [],
      message: "These assets are named in the registry but their on-chain addresses are not verified yet, so no quote can be requested.",
    });
  }

  const result = await collectQuotes(
    {
      chainId: intent.chainId, tokenIn: tIn.symbol, tokenOut: tOut.symbol,
      amountInBaseUnits: parseDecimal(intent.amountIn, tIn.decimals).toString(),
      slippageBps: intent.slippageBps ?? 50, privateRequested: intent.privateRequested,
    },
    ADAPTERS,
  );
  await auditFor(req, { action: "quotes.request", intentKind: "swap", decision: result.routes.length ? "routes" : "none" });
  return jsonOk(result);
}
