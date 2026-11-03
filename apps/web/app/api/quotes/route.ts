
import { auditFor } from "@/lib/audit-request";
import {
  findAsset,
  ROBINHOOD_CHAIN_ID,
} from "@vetto/asset-registry";
import {
  parseDecimal,
  validateIntent,
  IntentValidationError,
} from "@vetto/intent-parser";
import { collectQuotes } from "@vetto/quote-engine";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { robinhoodV4QuoteAdapter } from "@/lib/robinhood-v4-quote-adapter";

export const runtime = "nodejs";

/**
 * Only the Robinhood v4 adapter is registered.
 * Quotes from this adapter are display-only and cannot execute swaps.
 */
const ADAPTERS = [robinhoodV4QuoteAdapter] as const;

export async function POST(req: Request) {
  const guard = await guardJson(req, "quotes", 20);

  if ("res" in guard) return guard.res;
  if (!isRecord(guard.body)) {
    return jsonError(400, "Expected { intent }.");
  }

  let intent;

  try {
    intent = validateIntent(guard.body.intent);
  } catch (error) {
    return jsonError(
      400,
      error instanceof IntentValidationError
        ? error.message
        : "Invalid intent.",
    );
  }

  if (intent.kind !== "swap") {
    return jsonError(400, "Only swap intents can be quoted.");
  }

  if (intent.chainId !== ROBINHOOD_CHAIN_ID) {
    return jsonError(400, "Unsupported quote network.");
  }

  const tokenIn = findAsset(intent.tokenIn);
  const tokenOut = findAsset(intent.tokenOut);

  if (!tokenIn || !tokenOut) {
    return jsonError(422, "Unknown asset.");
  }

  const result = await collectQuotes(
    {
      chainId: intent.chainId,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountInBaseUnits: parseDecimal(
        intent.amountIn,
        tokenIn.decimals,
      ).toString(),
      slippageBps: intent.slippageBps ?? 50,
      privateRequested: intent.privateRequested,
    },
    ADAPTERS,
  );

  await auditFor(req, {
    action: "quotes.request",
    intentKind: "swap",
    decision: result.routes.length > 0 ? "routes" : "none",
  });

  return jsonOk({
    ...result,
    routes: result.routes.map((route) => ({
      ...route,
      isExecutable: false,
    })),
  });
}
