import { auditFor } from "@/lib/audit-request";
import { configuredLlmParser } from "@/lib/llm-parser";
import { findAsset } from "@vetto/asset-registry";
import { parseDecimal, parseIntent, parseIntentWithLlm, type ParseContext, type PendingIntent } from "@vetto/intent-parser";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { findSecret, secretMessage } from "@/lib/secret-guard";

export const runtime = "nodejs";

function parseContext(value: unknown): ParseContext {
  if (!isRecord(value)) return {};
  const context: ParseContext = {};

  if (typeof value.lastUrl === "string" && value.lastUrl.length <= 2048) {
    try {
      const url = new URL(value.lastUrl);
      if (url.protocol === "http:" || url.protocol === "https:") context.lastUrl = url.toString();
    } catch {
      // Invalid optional context is ignored; the user message remains authoritative.
    }
  }

  if (isRecord(value.lastPair) && typeof value.lastPair.tokenIn === "string" && typeof value.lastPair.tokenOut === "string") {
    const tokenIn = findAsset(value.lastPair.tokenIn.toUpperCase());
    const tokenOut = findAsset(value.lastPair.tokenOut.toUpperCase());
    if (tokenIn && tokenOut && tokenIn.symbol !== tokenOut.symbol) {
      context.lastPair = { tokenIn: tokenIn.symbol, tokenOut: tokenOut.symbol };
    }
  }

  if (
    isRecord(value.pendingIntent) && value.pendingIntent.kind === "swap" &&
    typeof value.pendingIntent.tokenIn === "string" &&
    typeof value.pendingIntent.amountIn === "string" &&
    typeof value.pendingIntent.privateRequested === "boolean"
  ) {
    const tokenIn = findAsset(value.pendingIntent.tokenIn.toUpperCase());
    const amountIn = value.pendingIntent.amountIn;
    const slippageBps = value.pendingIntent.slippageBps;
    if (
      tokenIn &&
      (slippageBps === undefined || (typeof slippageBps === "number" && Number.isInteger(slippageBps) && slippageBps >= 1 && slippageBps <= 1000))
    ) {
      try {
        if (parseDecimal(amountIn, tokenIn.decimals) > 0n) {
          const pending: PendingIntent = {
            kind: "swap",
            tokenIn: tokenIn.symbol,
            amountIn,
            privateRequested: value.pendingIntent.privateRequested,
            ...(slippageBps !== undefined ? { slippageBps } : {}),
          };
          context.pendingIntent = pending;
        }
      } catch {
        // Invalid optional context is ignored; the user message remains authoritative.
      }
    }
  }
  return context;
}

/** text -> validated, typed intent + the visible interpretation line. Never executes anything. */
export async function POST(req: Request) {
  const g = await guardJson(req, "intent");
  if ("res" in g) return g.res;
  if (!isRecord(g.body) || typeof g.body.text !== "string") return jsonError(400, "Expected { text: string }.");

  // Seed phrase / private key: tolak SEBELUM diparse, dicatat, atau disimpan. Audit hanya mencatat jenisnya.
  const secret = findSecret(g.body.text);
  if (secret) {
    await auditFor(req, { action: "input.secret_blocked", decision: secret });
    return jsonError(422, secretMessage(secret), { code: "SECRET_DETECTED" });
  }

  const ctx = parseContext(g.body.context);
  const result = await parseIntentWithLlm(g.body.text, ctx, configuredLlmParser());
  await auditFor(req, { action: "intent.parse", intentKind: result.intent.kind }); // never the raw text
  return jsonOk(result);
}
