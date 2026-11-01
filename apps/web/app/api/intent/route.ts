import { audit } from "@/lib/audit";
import { parseIntent } from "@vetto/intent-parser";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/** text -> validated, typed intent + the visible interpretation line. Never executes anything. */
export async function POST(req: Request) {
  const g = await guardJson(req, "intent");
  if ("res" in g) return g.res;
  if (!isRecord(g.body) || typeof g.body.text !== "string") return jsonError(400, "Expected { text: string }.");

  const ctx = isRecord(g.body.context) && typeof g.body.context.lastUrl === "string" ? { lastUrl: g.body.context.lastUrl } : {};
  // Deterministic parser is authoritative. An LLM adapter (parseIntentWithLlm) plugs in here later,
  // and its output would still pass validateIntent() + registry resolution.
  const result = parseIntent(g.body.text, ctx);
  await audit({ action: "intent.parse", intentKind: result.intent.kind }); // never the raw text
  return jsonOk(result);
}
