import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { findSecret, secretMessage } from "@/lib/secret-guard";

const HISTORY_LIMIT = 50;
const HISTORY_RETENTION = 100;

interface HistoryRow {
  id: string;
  prompt: string;
  created_at: Date;
}

interface IdempotencyRow {
  user_id: string;
  request_hash: string;
  response: { item: { id: string; prompt: string; createdAt: string } } | null;
}

function historyItem(row: HistoryRow) {
  return { id: row.id, prompt: row.prompt, createdAt: row.created_at.toISOString() };
}

export async function GET(request: Request) {
  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch (error) {
    console.error("Chat history authentication failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Chat history is temporarily unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in to view your saved history.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Chat history is temporarily unavailable.");
  try {
    const result = await getPool(databaseUrl).query<HistoryRow>(
      `select id, prompt, created_at
       from user_chat_history
       where user_id = $1
       order by created_at desc, id desc
       limit $2`,
      [userId, HISTORY_LIMIT],
    );
    return jsonOk({ items: result.rows.map(historyItem) });
  } catch (error) {
    console.error("Chat history could not be loaded:", error instanceof Error ? error.message : error);
    return jsonError(503, "Chat history is temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "history-write", 30);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body) || typeof guarded.body.prompt !== "string") {
    return jsonError(400, "A prompt is required.");
  }

  const prompt = guarded.body.prompt.trim();
  if (!prompt || prompt.length > 500) return jsonError(400, "Prompt must contain between 1 and 500 characters.");

  // Defense in depth: never persist secrets, regardless of the input path.
  const secret = findSecret(prompt);
  if (secret) return jsonError(422, secretMessage(secret), { code: "SECRET_DETECTED" });

  const clientKey = request.headers.get("idempotency-key");
  if (!clientKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientKey)) {
    return jsonError(400, "A valid Idempotency-Key UUID is required.");
  }

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch (error) {
    console.error("Chat history authentication failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Chat history is temporarily unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in to save chat history.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Chat history is temporarily unavailable.");
  const key = `history:${clientKey}`;
  const requestHash = createHash("sha256").update(prompt).digest("hex");
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
    if (!idempotency) throw new Error("History idempotency record was not returned.");
    if (idempotency.user_id !== userId || idempotency.request_hash !== requestHash) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(409, "This Idempotency-Key was already used for a different request.");
    }
    if (idempotency.response) {
      await client.query("commit");
      transactionOpen = false;
      return jsonOk(idempotency.response);
    }

    const inserted = await client.query<HistoryRow>(
      `insert into user_chat_history (user_id, prompt)
       values ($1, $2)
       returning id, prompt, created_at`,
      [userId, prompt],
    );
    const item = historyItem(inserted.rows[0]!);
    const response = { item };
    await client.query(
      "update idempotency_keys set response = $2::jsonb where key = $1",
      [key, JSON.stringify(response)],
    );
    await client.query(
      `delete from user_chat_history
       where id in (
         select id from user_chat_history
         where user_id = $1
         order by created_at desc, id desc
         offset $2
       )`,
      [userId, HISTORY_RETENTION],
    );
    await client.query("commit");
    transactionOpen = false;
    return jsonOk(response);
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("Chat history transaction rollback failed:", rollbackError instanceof Error ? rollbackError.message : rollbackError);
      }
    }
    console.error("Chat history could not be saved:", error instanceof Error ? error.message : error);
    return jsonError(503, "Chat history is temporarily unavailable.");
  } finally {
    client?.release();
  }
}
