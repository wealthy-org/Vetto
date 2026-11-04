import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { authenticatedUserId } from "@/lib/authenticated-user";
import { writeAudit } from "@/lib/audit";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError } from "@/lib/http";
import {
  validateIntent,
  IntentValidationError,
  parseDecimal,
} from "@vetto/intent-parser";
import { findAsset } from "@vetto/asset-registry";
import {
  simulateRobinhoodV4Swap,
  type SimulationResult,
} from "@/lib/robinhood-v4-simulator";

export const runtime = "nodejs";

interface WalletRow {
  address: string;
  chain_id: string;
}

interface IdempotencyRow {
  user_id: string;
  request_hash: string;
  response: {
    status: number;
    body: Record<string, unknown>;
  } | null;
}

function storedResponse(response: IdempotencyRow["response"]): Response {
  if (!response) throw new Error("Missing idempotency response.");
  return Response.json(response.body, {
    status: response.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "execute-prepare", 10);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) {
    return jsonError(400, "Expected a swap intent.");
  }

  let intent;
  try {
    intent = validateIntent(guarded.body.intent);
  } catch (error) {
    return jsonError(
      400,
      error instanceof IntentValidationError
        ? error.message
        : "Invalid intent.",
    );
  }

  if (intent.kind !== "swap") {
    return jsonError(422, "Only swap intents can be prepared.");
  }

  if (intent.privateRequested) {
    return jsonError(422, "Private swap execution is not supported.");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (
    !idempotencyKey ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
  ) {
    return jsonError(400, "A valid Idempotency-Key UUID is required.");
  }

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch {
    return jsonError(503, "Authentication service is unavailable.");
  }

  if (!userId) return jsonError(401, "Sign in before preparing a swap.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Database is unavailable.");

  const key = `execute-prepare:${idempotencyKey}`;
  const requestHash = createHash("sha256")
    .update(JSON.stringify(intent))
    .digest("hex");

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

    const record = existing.rows[0];
    if (!record) throw new Error("Idempotency record missing.");

    if (
      record.user_id !== userId ||
      record.request_hash !== requestHash
    ) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(409, "Idempotency key already used.");
    }

    if (record.response) {
      await client.query("commit");
      transactionOpen = false;
      return storedResponse(record.response);
    }

    const walletResult = await client.query<WalletRow>(
      `select address, chain_id
       from wallet_identities
       where user_id = $1 and chain_id = '4663'
       order by last_seen_at desc
       limit 1`,
      [userId],
    );

    const wallet = walletResult.rows[0];
    if (!wallet || Number(wallet.chain_id) !== 4663) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(404, "No linked Robinhood Chain wallet found.");
    }

    const tokenIn = findAsset(intent.tokenIn);
    const tokenOut = findAsset(intent.tokenOut);

    if (!tokenIn || !tokenOut) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(422, "Unknown swap asset.");
    }

    const amountInBaseUnits = parseDecimal(
      intent.amountIn,
      tokenIn.decimals,
    ).toString();

    let simulation: SimulationResult;

    try {
      simulation = await simulateRobinhoodV4Swap({
        wallet: wallet.address,
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        amountInBaseUnits,
        slippageBps: intent.slippageBps ?? 50,
      });
    } catch (error) {
      const configurationMissing =
        error instanceof Error &&
        error.message ===
          "Primary RPC, secondary RPC, or verified USDG configuration is missing.";

      if (!configurationMissing) {
        throw error;
      }

      const failure = {
        error: "Swap execution is not configured. No transaction was sent.",
        code: "EXECUTION_DISABLED",
      };

      await writeAudit(
        { query: (text, values) => client!.query(text, [...values]) },
        {
          userId,
          action: "execute.prepare",
          intentKind: intent.kind,
          decision: "execution-disabled",
        },
      );

      await client.query(
        "update idempotency_keys set response = $2::jsonb where key = $1",
        [key, JSON.stringify({ status: 503, body: failure })],
      );

      await client.query("commit");
      transactionOpen = false;

      return storedResponse({ status: 503, body: failure });
    }

    if (simulation.status !== "passed" || !simulation.transaction) {
      const failure = {
        error: simulation.reason ?? "Swap simulation failed.",
        code: "SIMULATION_FAILED",
        simulation,
      };

      await writeAudit(
        { query: (text, values) => client!.query(text, [...values]) },
        {
          userId,
          action: "execute.prepare",
          intentKind: intent.kind,
          decision: "simulation-failed",
        },
      );

      await client.query(
        "update idempotency_keys set response = $2::jsonb where key = $1",
        [key, JSON.stringify({ status: 422, body: failure })],
      );
      await client.query("commit");
      transactionOpen = false;

      return storedResponse({ status: 422, body: failure });
    }

    const body = {
      status: "prepared",
      chainId: 4663,
      wallet: simulation.wallet,
      transaction: simulation.transaction,
      simulation: {
        expectedOutBaseUnits: simulation.expectedOutBaseUnits,
        minOutBaseUnits: simulation.minOutBaseUnits,
        estimatedGas: simulation.estimatedGas,
        quoteBlockNumber: simulation.quoteBlockNumber,
      },
    };

    await writeAudit(
      { query: (text, values) => client!.query(text, [...values]) },
      {
        userId,
        action: "execute.prepare",
        intentKind: intent.kind,
        decision: "simulation-passed",
      },
    );

    await client.query(
      "update idempotency_keys set response = $2::jsonb where key = $1",
      [key, JSON.stringify({ status: 200, body })],
    );

    await client.query("commit");
    transactionOpen = false;

    return storedResponse({ status: 200, body });
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("rollback");
      } catch {
        console.error("Prepare rollback failed.");
      }
    }

    console.error(
      "Swap preparation failed:",
      error instanceof Error ? error.message : error,
    );

    return jsonError(503, "Swap preparation failed. No transaction was sent.");
  } finally {
    client?.release();
  }
}