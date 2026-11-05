import { getPool } from "@/lib/db";
import { jsonError, jsonOk, limitClient } from "@/lib/http";
import { clearSessionCookie, hashSessionToken, readSessionToken } from "@/lib/wallet-auth";

interface SessionRow {
  address: string;
  chain_id: string;
  connector: string | null;
}

export async function GET(request: Request) {
  const token = readSessionToken(request);
  if (!token) return jsonOk({ authenticated: false }); // tanpa cookie = tanpa biaya database, tidak perlu dibatasi

  const limited = await limitClient(request, "session", 120);
  if (limited) return limited;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Session status is temporarily unavailable.");
  try {
    const result = await getPool(databaseUrl).query<SessionRow>(
      `select w.address, w.chain_id, s.connector
       from user_sessions s
       join wallet_identities w on w.user_id = s.user_id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
       order by w.last_seen_at desc
       limit 1`,
      [hashSessionToken(token)],
    );
    if (!result.rows[0]) {
      const response = jsonOk({ authenticated: false });
      response.headers.append("Set-Cookie", clearSessionCookie());
      return response;
    }
    return jsonOk({
      authenticated: true,
      wallet: {
        address: result.rows[0].address,
        chainId: Number(result.rows[0].chain_id),
        connector: result.rows[0].connector,
      },
    });
  } catch (error) {
    console.error("Wallet session lookup failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Session status is temporarily unavailable.");
  }
}
