import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { clearSessionCookie, hashSessionToken, readSessionToken } from "@/lib/wallet-auth";

export async function POST(request: Request) {
  const guarded = await guardJson(request, "auth-logout", 20);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Invalid request.");

  const token = readSessionToken(request);
  if (token) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return jsonError(503, "Sign-out is temporarily unavailable.");
    try {
      await getPool(databaseUrl).query(
        "update user_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null",
        [hashSessionToken(token)],
      );
    } catch (error) {
      console.error("Wallet session could not be revoked:", error instanceof Error ? error.message : error);
      return jsonError(503, "Sign-out is temporarily unavailable.");
    }
  }

  const response = jsonOk({ authenticated: false });
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
