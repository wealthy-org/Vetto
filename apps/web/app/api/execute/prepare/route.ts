import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { authenticatedUserId } from "@/lib/authenticated-user";
import { writeAudit } from "@/lib/audit";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError } from "@/lib/http";
import { validateIntent, IntentValidationError } from "@vetto/intent-parser";

export const runtime = "nodejs";

const DISABLED_RESPONSE = {
  status: 503,
  body: {
    error: "Transaction preparation is disabled until Phase 0 verifies the chain, assets, and an executable route.",
    code: "EXECUTION_DISABLED",
  },
} as const;

interface IdempotencyRow {
  user_id: string;
  request_hash: string;
  response: { status: number; body: Record<string, string> } | null;
}

function storedResponse(response: IdempotencyRow["response"]): Response {
  if (!response) throw new Error("Execution preparation idempotency response is missing.");
  return Response.json(response.body, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "execute-prepare", 10);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Expected an object containing a swap intent.");

  let intent;
  try {
    intent = validateIntent(guarded.body.intent);
  } catch (error) {
    return jsonError(400, error instanceof IntentValidationError ? error.message : "Invalid intent.");
  }
  if (intent.kind !== "swap") return jsonError(422, "Only swap intents can be prepared.");

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    return jsonError(400, "A valid Idempotency-Key UUID is required.");
  }

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch (error) {
    console.error("Execution preparation authentication failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Transaction preparation is temporarily unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in before preparing a transaction.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Transaction preparation is temporarily unavailable.");

  const key = `execute-prepare:${idempotencyKey}`;
  const requestHash = createHash("sha256").update(JSON.stringify(intent)).digest("hex");
  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await getPool(databaseUrl).connect();
    await client.query("begin");
    transactionOpen = true;

    await client.query(
      "delete from idempotency_keys where key = $1 and expires_at <= now()",
      [key],
    );
    await client.query(
      `delete from idempotency_keys
       where key in (
         select key from idempotency_keys
         where expires_at <= now()
         order by expires_at
         limit 100
       )`,
    );
    await client.query(
      `insert into idempotency_keys (key, user_id, request_hash)
       values ($1, $2, $3)
       on conflict (key) do nothing`,
      [key, userId, requestHash],
    );
    const existing = await client.query<IdempotencyRow>(
      `select user_id, request_hash, response
       from idempotency_keys
       where key = $1
       for update`,
      [key],
    );
    const idempotency = existing.rows[0];
    if (!idempotency) throw new Error("Execution preparation idempotency record was not returned.");
    if (idempotency.user_id !== userId || idempotency.request_hash !== requestHash) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(409, "This Idempotency-Key was already used for a different request.");
    }
    if (idempotency.response) {
      await client.query("commit");
      transactionOpen = false;
      return storedResponse(idempotency.response);
    }

    await writeAudit(
      { query: (text, values) => client!.query(text, [...values]) },
      {
        userId,
        action: "execute.prepare",
        intentKind: intent.kind,
        decision: "phase0-unverified",
      },
    );
    await client.query(
      "update idempotency_keys set response = $2::jsonb where key = $1",
      [key, JSON.stringify(DISABLED_RESPONSE)],
    );
    await client.query("commit");
    transactionOpen = false;
    return storedResponse(DISABLED_RESPONSE);
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("Execution preparation transaction rollback failed:", rollbackError instanceof Error ? rollbackError.message : rollbackError);
      }
    }
    console.error("Execution preparation failed closed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Transaction preparation is temporarily unavailable; no payload was created.");
  } finally {
    client?.release();
  }
}
