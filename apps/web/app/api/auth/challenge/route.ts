import { randomBytes, randomUUID } from "node:crypto";
import { expectedOrigin, jsonError, jsonOk, guardJson, isRecord } from "@/lib/http";
import { getPool } from "@/lib/db";
import { failureFields } from "@/lib/setup-hints";
import {
  AUTH_CHALLENGE_TTL_SECONDS,
  makeSiweMessage,
  normalizeWalletAddress,
  isWalletAuthChainId,
  WALLET_AUTH_CHAIN_ID,
} from "@/lib/wallet-auth";

/** localhost/127.0.0.1/[::1] — a developer's own machine, never a public host. */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "auth-challenge", 10);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Invalid request.");

  const address = normalizeWalletAddress(guarded.body.address);
  if (!address) return jsonError(400, "A valid EVM wallet address is required.");
  const chainId = guarded.body.chainId === undefined ? WALLET_AUTH_CHAIN_ID : guarded.body.chainId;
  if (!isWalletAuthChainId(chainId)) {
    return jsonError(400, "Wallet sign-in supports Ethereum Mainnet (1) or Robinhood Chain (4663).");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Wallet sign-in is unavailable until the database is configured.");

  // A public production deployment must pin APP_ORIGIN to its https origin: the SIWE
  // message is signed over that value, so it can never be inferred from a header.
  // Loopback is the one exception — `next start` on your own machine is not public, and
  // demanding https there would make wallet sign-in impossible to try locally.
  // Derive from the Host/x-forwarded-host headers (same resolver the CSRF guard uses),
  // not from request.url, which reflects the bind address (0.0.0.0) behind a proxy.
  const requestOrigin = expectedOrigin(request);
  const loopback = isLoopbackOrigin(requestOrigin);
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN && !loopback) {
    return jsonError(503, "Wallet sign-in requires APP_ORIGIN to be configured in production.", {
      code: "APP_ORIGIN_MISSING",
      hint: `Set APP_ORIGIN to this deployment's https origin (for example ${requestOrigin}) in apps/web/.env.local, then restart.`,
    });
  }
  const configuredOrigin = process.env.APP_ORIGIN ?? requestOrigin;
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
    const httpsRequired = process.env.NODE_ENV === "production" && !isLoopbackOrigin(origin.origin);
    if (origin.origin !== configuredOrigin || (httpsRequired && origin.protocol !== "https:")) {
      return jsonError(503, "Wallet sign-in origin is misconfigured.", {
        code: "APP_ORIGIN_INVALID",
        hint: "APP_ORIGIN must be a bare origin such as https://vetto.app — no path, no trailing slash.",
      });
    }
  } catch {
    return jsonError(503, "Wallet sign-in origin is misconfigured.", {
      code: "APP_ORIGIN_INVALID",
      hint: "APP_ORIGIN must be a bare origin such as https://vetto.app — no path, no trailing slash.",
    });
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + AUTH_CHALLENGE_TTL_SECONDS * 1000);
  const id = randomUUID();
  const message = makeSiweMessage({
    domain: origin.host,
    uri: origin.origin,
    address,
    chainId,
    nonce: randomBytes(16).toString("hex"),
    issuedAt,
    expiresAt,
  });

  try {
    const pool = getPool(databaseUrl);
    await pool.query(
      `delete from wallet_auth_challenges
       where expires_at < now() - interval '1 day'
          or consumed_at < now() - interval '1 hour'`,
    );
    await pool.query(
      `delete from user_sessions
       where expires_at < now()
          or revoked_at < now() - interval '30 days'`,
    );
    await pool.query(
      `insert into wallet_auth_challenges (id, chain_id, address, message, expires_at)
       values ($1, $2, $3, $4, $5)`,
      [id, chainId, address.toLowerCase(), message, expiresAt],
    );
  } catch (error) {
    console.error("Wallet auth challenge could not be stored:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet sign-in is temporarily unavailable.", failureFields(error));
  }

  return jsonOk({ challengeId: id, message, expiresAt: expiresAt.toISOString() });
}
