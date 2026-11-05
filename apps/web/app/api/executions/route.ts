import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { limitClient, jsonError, jsonOk } from "@/lib/http";
import { listExecutions } from "@/lib/executions";

export const runtime = "nodejs";

/** Recent swap executions for the signed-in user, newest first. */
export async function GET(request: Request) {
  const limited = await limitClient(request, "executions-list", 60);
  if (limited) return limited;

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch {
    return jsonError(503, "Authentication service is unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in to see your transactions.");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Database is unavailable.");

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);

  try {
    const records = await listExecutions(getPool(databaseUrl), userId, Number.isFinite(limit) ? limit : 20);
    return jsonOk({
      executions: records.map((record) => ({
        id: record.id,
        status: record.status,
        tokenIn: record.tokenIn,
        tokenOut: record.tokenOut,
        amountInBaseUnits: record.amountInBaseUnits,
        expectedOutBaseUnits: record.expectedOutBaseUnits,
        minOutBaseUnits: record.minOutBaseUnits,
        venueId: record.venueId,
        txHash: record.txHash,
        createdAt: record.createdAt,
        confirmedAt: record.confirmedAt,
      })),
    });
  } catch (error) {
    console.error("Execution list failed:", error instanceof Error ? error.message : error);
    return jsonError(503, "Transaction history is temporarily unavailable.");
  }
}
