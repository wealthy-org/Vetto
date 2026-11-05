import { createHash, randomUUID } from "node:crypto";
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
import { findAsset, isExecutableAsset } from "@vetto/asset-registry";
import { simulateRobinhoodV4Swap, type SimulationResult } from "@/lib/robinhood-v4-simulator";
import {
  CONTRACTS,
  POOL_VENUES,
  ROBINHOOD_CHAIN_ID,
  findVenue,
  swapExecutionEnabled,
} from "@/lib/robinhood-chain";
import { fingerprintPayload, fingerprintQuote, sameDigest } from "@/lib/quote-fingerprint";

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

/**
 * Turns a reviewed swap into one unsigned payload, after simulation.
 *
 * Never accepts calldata, a recipient or an amount from the browser: those are
 * rebuilt here from the validated intent plus a registered venue. The response
 * carries a payload hash the browser must echo when it reports its transaction
 * hash, so a swapped `to`/`data`/`value` cannot be registered as reviewed.
 */
export async function POST(request: Request) {
  const guarded = await guardJson(request, "execute-prepare", 10);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Expected a swap intent.");

  let intent;
  try {
    intent = validateIntent(guarded.body.intent);
  } catch (error) {
    return jsonError(
      400,
      error instanceof IntentValidationError ? error.message : "Invalid intent.",
    );
  }

  if (intent.kind !== "swap") return jsonError(422, "Only swap intents can be prepared.");
  if (intent.privateRequested) return jsonError(422, "Private swap execution is not supported.");

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

  const body = guarded.body;
  const requestedVenueId = typeof body.venueId === "string" ? body.venueId : undefined;
  const reviewedFingerprint = typeof body.quoteFingerprint === "string" ? body.quoteFingerprint : undefined;
  const reviewedMinOutRaw =
    typeof body.reviewedMinOutBaseUnits === "string" ? body.reviewedMinOutBaseUnits : undefined;

  if (requestedVenueId !== undefined && !findVenue(requestedVenueId)) {
    return jsonError(422, "Unknown trading venue.");
  }
  if (reviewedMinOutRaw !== undefined && !/^\d+$/.test(reviewedMinOutRaw)) {
    return jsonError(400, "Invalid reviewed minimum output.");
  }

  const venue = findVenue(requestedVenueId ?? POOL_VENUES[0]!.id)!;

  const key = `execute-prepare:${idempotencyKey}`;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ intent, venueId: venue.id }))
    .digest("hex");

  let client: PoolClient | undefined;
  let transactionOpen = false;

  try {
    client = await getPool(databaseUrl).connect();
    await client.query("begin");
    transactionOpen = true;

    await client.query("delete from idempotency_keys where key = $1 and expires_at <= now()", [key]);
    await client.query(
      `insert into idempotency_keys (key, user_id, request_hash)
       values ($1, $2, $3)
       on conflict (key) do nothing`,
      [key, userId, requestHash],
    );

    const existing = await client.query<IdempotencyRow>(
      `select user_id, request_hash, response from idempotency_keys where key = $1 for update`,
      [key],
    );

    const record = existing.rows[0];
    if (!record) throw new Error("Idempotency record missing.");

    if (record.user_id !== userId || record.request_hash !== requestHash) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(409, "Idempotency key already used.");
    }

    if (record.response) {
      await client.query("commit");
      transactionOpen = false;
      return storedResponse(record.response);
    }

    const db = client;

    const fail = async (
      status: number,
      failure: Record<string, unknown>,
      decision: string,
    ) => {
      await writeAudit(
        { query: (text, values) => db.query(text, [...values]) },
        { userId: userId!, action: "execute.prepare", intentKind: intent.kind, decision },
      );
      await db.query("update idempotency_keys set response = $2::jsonb where key = $1", [
        key,
        JSON.stringify({ status, body: failure }),
      ]);
      await db.query("commit");
      transactionOpen = false;
      return storedResponse({ status, body: failure });
    };

    // Execution is opt-in per deployment. When it is off we still record the
    // attempt, but we never build or simulate a transaction.
    if (!swapExecutionEnabled()) {
      return await fail(
        503,
        {
          error: "Swap execution is not configured for this deployment. No transaction was sent.",
          code: "EXECUTION_DISABLED",
        },
        "execution-disabled",
      );
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
    if (!wallet || Number(wallet.chain_id) !== ROBINHOOD_CHAIN_ID) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(404, "No linked Robinhood Chain wallet found.");
    }

    const tokenIn = findAsset(intent.tokenIn);
    const tokenOut = findAsset(intent.tokenOut);

    if (!isExecutableAsset(tokenIn) || !isExecutableAsset(tokenOut)) {
      await client.query("rollback");
      transactionOpen = false;
      return jsonError(422, "Unknown swap asset.");
    }

    const amountInBaseUnits = parseDecimal(intent.amountIn, tokenIn.decimals).toString();
    const slippageBps = intent.slippageBps ?? 50;

    let simulation: SimulationResult;

    try {
      simulation = await simulateRobinhoodV4Swap({
        wallet: wallet.address,
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        amountInBaseUnits,
        slippageBps,
        venueId: venue.id,
        reviewedMinOutBaseUnits: reviewedMinOutRaw,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message.includes("configuration is missing")) {
        return await fail(
          503,
          { error: "Swap execution is not configured. No transaction was sent.", code: "EXECUTION_DISABLED" },
          "execution-disabled",
        );
      }

      throw error;
    }

    if (simulation.status !== "passed" || !simulation.transaction) {
      return await fail(
        422,
        {
          error: simulation.reason ?? "Swap simulation failed.",
          code: "SIMULATION_FAILED",
          simulation,
        },
        "simulation-failed",
      );
    }

    // Integrity of what the user reviewed: recompute the digest from the
    // intent + venue and require the browser to have sent the same one.
    const computedFingerprint = fingerprintQuote({
      chainId: ROBINHOOD_CHAIN_ID,
      venueId: venue.id,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountInBaseUnits,
      minOutBaseUnits: reviewedMinOutRaw ?? simulation.minOutBaseUnits!,
      slippageBps,
      router: CONTRACTS.universalRouter.toLowerCase(),
    });

    if (reviewedFingerprint !== undefined && !sameDigest(reviewedFingerprint, computedFingerprint)) {
      return await fail(
        409,
        {
          error: "The transaction did not match the quote you reviewed. Nothing was sent.",
          code: "QUOTE_CHANGED",
        },
        "fingerprint-mismatch",
      );
    }

    const payload = {
      chainId: ROBINHOOD_CHAIN_ID,
      to: simulation.transaction.to,
      data: simulation.transaction.data,
      value: simulation.transaction.value,
      deadline: simulation.transaction.deadline,
    };
    const payloadHash = fingerprintPayload(payload);
    const executionId = randomUUID();

    await client.query(
      `insert into swap_executions (
         id, user_id, chain_id, status, token_in, token_out, amount_in_base_units,
         venue_id, slippage_bps, expected_out_base_units, min_out_base_units,
         quote_fingerprint, payload_hash, payload
       ) values ($1,$2,$3,'prepared',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [
        executionId,
        userId,
        ROBINHOOD_CHAIN_ID,
        tokenIn.symbol,
        tokenOut.symbol,
        amountInBaseUnits,
        venue.id,
        slippageBps,
        simulation.expectedOutBaseUnits,
        simulation.minOutBaseUnits,
        computedFingerprint,
        payloadHash,
        JSON.stringify(payload),
      ],
    );

    const responseBody = {
      status: "prepared",
      executionId,
      chainId: ROBINHOOD_CHAIN_ID,
      wallet: simulation.wallet,
      venue: { id: venue.id, label: venue.label },
      transaction: payload,
      payloadHash,
      quoteFingerprint: computedFingerprint,
      simulation: {
        expectedOutBaseUnits: simulation.expectedOutBaseUnits,
        minOutBaseUnits: simulation.minOutBaseUnits,
        estimatedGas: simulation.estimatedGas,
        gasPriceWei: simulation.gasPriceWei,
        allowance: simulation.allowance ?? null,
        quoteBlockNumber: simulation.quoteBlockNumber,
      },
    };

    await writeAudit(
      { query: (text, values) => client!.query(text, [...values]) },
      { userId, action: "execute.prepare", intentKind: intent.kind, decision: "simulation-passed" },
    );

    await client.query("update idempotency_keys set response = $2::jsonb where key = $1", [
      key,
      JSON.stringify({ status: 200, body: responseBody }),
    ]);

    await client.query("commit");
    transactionOpen = false;

    return storedResponse({ status: 200, body: responseBody });
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("rollback");
      } catch {
        console.error("Prepare rollback failed.");
      }
    }

    console.error("Swap preparation failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Swap preparation failed. No transaction was sent.");
  } finally {
    client?.release();
  }
}
