import { rateLimiter } from "./rate-limit";

const MAX_BODY_BYTES = 4096;

export const jsonError = (status: number, error: string, extra?: Record<string, unknown>, headers?: HeadersInit) =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const jsonOk = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

function clientKey(req: Request): string {
  // Only trust the first hop your platform sets. Configure your proxy so clients cannot spoof this.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Common guard for state-changing JSON endpoints: same-origin (CSRF), JSON only,
 * bounded body, per-client rate limit. Returns the parsed body or a ready-to-send error response.
 * Behind a reverse proxy set APP_ORIGIN (e.g. https://vetto.app) so the origin check stays exact.
 */
export async function guardJson(req: Request, scope: string, max = 30, windowMs = 60_000): Promise<{ body: unknown } | { res: Response }> {
  const expected = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  const origin = req.headers.get("origin");
  if (!origin || origin !== expected) return { res: jsonError(403, "Cross-origin requests are not allowed.") };
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { res: jsonError(415, "Send application/json.") };

  let rl: Awaited<ReturnType<typeof rateLimiter.hit>>;
  try {
    rl = await rateLimiter.hit(`${scope}:${clientKey(req)}`, max, windowMs);
  } catch (error) {
    console.error("API rate-limit store is unavailable:", error);
    return { res: jsonError(503, "Request protection is temporarily unavailable.") };
  }
  if (!rl.ok) return { res: jsonError(429, "Too many requests. Try again shortly.", undefined, { "Retry-After": String(rl.retryAfterSec) }) };

  // Reject oversized bodies from the header first, then verify the real size.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return { res: jsonError(413, "Request too large.") };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { res: jsonError(413, "Request too large.") };
  try { return { body: JSON.parse(text) as unknown }; } catch { return { res: jsonError(400, "Invalid JSON.") }; }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);