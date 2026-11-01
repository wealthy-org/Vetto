import { getPool } from "./db";
import { hashSessionToken, readSessionToken } from "./wallet-auth";

export async function authenticatedUserId(request: Request): Promise<string | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for authenticated requests.");

  const result = await getPool(databaseUrl).query<{ user_id: string }>(
    `select user_id
     from user_sessions
     where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [hashSessionToken(token)],
  );
  return result.rows[0]?.user_id ?? null;
}
