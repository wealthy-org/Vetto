import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk, limitClient } from "@/lib/http";
import { getExecution } from "@/lib/executions";
import { explorerLink, reconcileExecution } from "@/lib/execution-receipts";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TX_HASH = /^0x[0-9a-f]{64}$/i;

async function requireUser(request: Request): Promise<string | Response> {
  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch {
    return jsonError(503, "Authentication service is unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in to view this transaction.");
  return userId;
}

/** Current state, reconciled against the chain (GET never mutates user data beyond status). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = await limitClient(request, "execution-get", 60);
  if (limited) return limited;

  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { id } = await context.params;
  if (!UUID.test(id)) return jsonError(400, "Invalid execution id.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Database is unavailable.");

  const pool = getPool(databaseUrl);
  const record = await getExecution(pool, user, id);
  if (!record) return jsonError(404, "Execution not found.");

  const outcome = await reconcileExecution(pool, record);
  const current = outcome.record ?? record;

  return jsonOk({
    execution: current,
    explorerUrl: current.txHash ? explorerLink(current.txHash) : null,
    note: outcome.note ?? null,
  });
}

/**
 * Register the wallet's transaction hash. The payload hash must match what the
 * server reviewed, so a modified payload cannot be recorded as this execution.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const guarded = await guardJson(request, "execution-submit", 20);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Expected { txHash, payloadHash }.");

  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const { id } = await context.params;
  if (!UUID.test(id)) return jsonError(400, "Invalid execution id.");

  const { txHash, payloadHash } = guarded.body;
  if (typeof txHash !== "string" || !TX_HASH.test(txHash)) {
    return jsonError(400, "A valid transaction hash is required.");
  }
  if (typeof payloadHash !== "string" || !/^[0-9a-f]{64}$/i.test(payloadHash)) {
    return jsonError(400, "The reviewed payload hash is required.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Database is unavailable.");

  const pool = getPool(databaseUrl);
  const { attachTransactionHash } = await import("@/lib/executions");
  const attached = await attachTransactionHash(pool, user, id, txHash.toLowerCase(), payloadHash);

  if ("error" in attached) {
    return jsonError(attached.error.includes("not found") ? 404 : 409, attached.error);
  }

  const outcome = await reconcileExecution(pool, attached.record);

  return jsonOk({
    execution: outcome.record ?? attached.record,
    explorerUrl: explorerLink(txHash.toLowerCase()),
    note: outcome.note ?? "Transaction registered. Waiting for confirmation.",
  });
}
