import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { verifyMessage, type Address } from "viem";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import {
  AUTH_SESSION_TTL_SECONDS,
  createSessionToken,
  hashSessionToken,
  makeSessionCookie,
  normalizeSignature,
  normalizeWalletAddress,
  isWalletAuthChainId,
  WALLET_AUTH_CHAIN_IDS,
} from "@/lib/wallet-auth";

interface ChallengeRow {
  id: string;
  chain_id: string;
  address: string;
  message: string;
}

export async function POST(request: Request) {
  const guarded = await guardJson(request, "auth-verify", 10);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Invalid request.");

  const challengeId = guarded.body.challengeId;
  const address = normalizeWalletAddress(guarded.body.address);
  const signature = normalizeSignature(guarded.body.signature);
  if (typeof challengeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId) || !address || !signature) {
    return jsonError(400, "Invalid wallet verification request.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Wallet sign-in is unavailable until the database is configured.");

  const pool = getPool(databaseUrl);
  let challenge: ChallengeRow | undefined;
  try {
    const result = await pool.query<ChallengeRow>(
      `select id, chain_id, address, message
       from wallet_auth_challenges
       where id = $1 and address = $2 and chain_id = any($3::bigint[])
         and consumed_at is null and expires_at > now()`,
      [challengeId, address.toLowerCase(), WALLET_AUTH_CHAIN_IDS],
    );
    challenge = result.rows[0];
  } catch (error) {
    console.error("Wallet auth challenge lookup failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet sign-in is temporarily unavailable.");
  }
  const chainId = challenge ? Number(challenge.chain_id) : null;
  if (!challenge || !isWalletAuthChainId(chainId)) {
    return jsonError(401, "The sign-in request expired or was already used. Please try again.");
  }

  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: challenge.address as Address,
      message: challenge.message,
      signature,
    });
  } catch {
    console.warn("Wallet signature verification rejected.");
  }
  if (!signatureValid) return jsonError(401, "The wallet signature is invalid.");

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const candidateUserId = randomUUID();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000);
  let client: PoolClient | null = null;
  let transactionOpen = false;
  let walletUserId: string | undefined;

  try {
    const transactionClient = await pool.connect();
    client = transactionClient;
    await transactionClient.query("begin");
    transactionOpen = true;
    const consumed = await transactionClient.query(
      `update wallet_auth_challenges
       set consumed_at = now()
       where id = $1 and address = $2 and chain_id = $3
         and consumed_at is null and expires_at > now()
       returning id`,
      [challengeId, address.toLowerCase(), chainId],
    );
    if (consumed.rowCount !== 1) {
      await transactionClient.query("rollback");
      transactionOpen = false;
      return jsonError(401, "The sign-in request expired or was already used. Please try again.");
    }

    await transactionClient.query("insert into users (id) values ($1)", [candidateUserId]);
    const identity = await transactionClient.query<{ user_id: string }>(
      `insert into wallet_identities (chain_id, address, user_id)
       values ($1, $2, $3)
       on conflict (chain_id, address)
       do update set last_seen_at = now()
       returning user_id`,
      [chainId, address.toLowerCase(), candidateUserId],
    );
    walletUserId = identity.rows[0]?.user_id;
    if (!walletUserId) throw new Error("Wallet identity was not returned.");

    if (walletUserId !== candidateUserId) {
      await transactionClient.query(
        `delete from users
         where id = $1
           and not exists (select 1 from wallet_identities where user_id = $1)
           and not exists (select 1 from user_sessions where user_id = $1)`,
        [candidateUserId],
      );
    }

    await transactionClient.query(
      `insert into user_sessions (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [sessionId, walletUserId, tokenHash, expiresAt],
    );
    await transactionClient.query(
      `insert into audit_log (user_id, action, decision, meta)
       values ($1, 'auth.wallet.sign_in', 'allow', $2::jsonb)`,
      [walletUserId, JSON.stringify({ chainId })],
    );
    await transactionClient.query("commit");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen && client) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        console.error("Wallet session transaction rollback failed:", rollbackError instanceof Error ? rollbackError.message : rollbackError);
      }
    }
    console.error("Wallet session could not be created:", error instanceof Error ? error.message : error);
    return jsonError(503, "Wallet sign-in is temporarily unavailable.");
  } finally {
    client?.release();
  }

  const response = jsonOk({
    authenticated: true,
    wallet: { address: address.toLowerCase(), chainId },
    expiresAt: expiresAt.toISOString(),
  });
  response.headers.append("Set-Cookie", makeSessionCookie(token));
  return response;
}
