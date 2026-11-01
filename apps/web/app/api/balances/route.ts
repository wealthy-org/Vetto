import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { readRobinhoodBalances } from "@/lib/robinhood-balances";
import { rateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface WalletRow {
  address: string;
}

export async function GET(request: Request) {
  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch (error) {
    console.error("Wallet balance authentication failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet balances are temporarily unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in to view wallet balances.");

  let limit: Awaited<ReturnType<typeof rateLimiter.hit>>;
  try {
    limit = await rateLimiter.hit(`balances:${userId}`, 20, 60_000);
  } catch (error) {
    console.error("Wallet balance rate-limit store is unavailable:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet balance protection is temporarily unavailable.");
  }
  if (!limit.ok) {
    return jsonError(429, "Too many balance requests. Try again shortly.", undefined, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Wallet balances are temporarily unavailable.");
  let address: string | undefined;
  try {
    const result = await getPool(databaseUrl).query<WalletRow>(
      `select address
       from wallet_identities
       where user_id = $1
       order by last_seen_at desc
       limit 1`,
      [userId],
    );
    address = result.rows[0]?.address;
  } catch (error) {
    console.error("Wallet address for balance lookup could not be loaded:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet balances are temporarily unavailable.");
  }
  if (!address) return jsonError(401, "Link a wallet before viewing balances.");

  try {
    const balances = await readRobinhoodBalances({
      address,
      primaryUrl: process.env.ROBINHOOD_RPC_URL_PRIMARY,
      secondaryUrl: process.env.ROBINHOOD_RPC_URL_SECONDARY,
      usdgAddress: process.env.ROBINHOOD_USDG_ADDRESS,
    });
    return jsonOk(balances);
  } catch (error) {
    console.error("Wallet balances could not be verified:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet balances could not be verified across both Robinhood RPCs.");
  }
}
