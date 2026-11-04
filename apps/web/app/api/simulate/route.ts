
import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { validateIntent, IntentValidationError, parseDecimal } from "@vetto/intent-parser";
import { findAsset } from "@vetto/asset-registry";
import { simulateRobinhoodV4Swap } from "@/lib/robinhood-v4-simulator";

export const runtime = "nodejs";

interface WalletRow {
  address: string;
  chain_id: string;
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "simulate", 10);
  if ("res" in guarded) return guarded.res;

  if (!isRecord(guarded.body)) {
    return jsonError(400, "Expected an object containing a swap intent.");
  }

  let intent;
  try {
    intent = validateIntent(guarded.body.intent);
  } catch (error) {
    return jsonError(
      400,
      error instanceof IntentValidationError ? error.message : "Invalid intent.",
    );
  }

  if (intent.kind !== "swap") {
    return jsonError(422, "Only swap intents can be simulated.");
  }

  if (intent.privateRequested) {
    return jsonError(422, "Private swap simulation is not supported.");
  }

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch {
    return jsonError(503, "Authentication service is unavailable.");
  }

  if (!userId) {
    return jsonError(401, "Sign in before simulating a transaction.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return jsonError(503, "Database is unavailable.");
  }

  try {
    const wallet = await getPool(databaseUrl).query<WalletRow>(
      `select address, chain_id
      from wallet_identities
      where user_id = $1
        and chain_id = '4663'
      order by last_seen_at desc
      limit 1`,
      [userId],
    );

    const linked = wallet.rows[0];
    if (!linked) return jsonError(404, "No linked wallet was found.");

    if (Number(linked.chain_id) !== 4663) {
      return jsonError(422, "Wallet is not linked to Robinhood Chain.");
    }

    const tokenIn = findAsset(intent.tokenIn);
    const tokenOut = findAsset(intent.tokenOut);

    if (!tokenIn || !tokenOut) {
      return jsonError(422, "Unknown asset.");
    }

    const amountInBaseUnits = parseDecimal(
      intent.amountIn,
      tokenIn.decimals,
    ).toString();

    const result = await simulateRobinhoodV4Swap({
      wallet: linked.address,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountInBaseUnits,
      slippageBps: intent.slippageBps ?? 50,
    });

    return jsonOk(result);
  } catch (error) {
    console.error(
      "Transaction simulation failed:",
      error instanceof Error ? error.message : error,
    );
    return jsonError(503, "Simulation service is temporarily unavailable.");
  }
}
