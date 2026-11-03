import { rankQuotes } from "./rank.ts";
import type { QuoteAdapter, QuoteRequest, QuoteResult } from "./types.ts";

export interface CollectOptions { timeoutMs?: number; now?: number; maxRoutes?: number }

/**
 * Fan out to VERIFIED adapters only. If nothing real comes back, say so — never pad the list.
 * Private requests are never silently downgraded to public routes.
 */
export async function collectQuotes(req: QuoteRequest, adapters: readonly QuoteAdapter[], opts: CollectOptions = {}): Promise<QuoteResult> {
  const { timeoutMs = 4000, now = Date.now(), maxRoutes = 5 } = opts;
  const skipped: QuoteResult["skipped"] = [];
  const live = adapters.filter((a) => {
    if (a.status !== "verified") skipped.push({ adapterId: a.id, reason: `status: ${a.status}` });
    return a.status === "verified";
  });

  if (live.length === 0) {
    return { routes: [], skipped, message: "No verified route is connected yet, so there is nothing to quote. Nothing was invented." };
  }

  const settled = await Promise.allSettled(
    live.map(async (a) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try { return await a.quote(req, ctl.signal); } finally { clearTimeout(timer); }
    }),
  );
  const all = settled.flatMap((s, i) => {
    if (s.status === "fulfilled") return s.value;
    skipped.push({ adapterId: live[i]!.id, reason: "failed or timed out" });
    return [];
  });

  let routes = rankQuotes(all, req, now, maxRoutes, true);
  if (req.privateRequested) {
    routes = routes.filter((r) => r.verifiedPrivacyRelay === true);
    if (routes.length === 0) {
      return { routes: [], skipped, message: "Private submission is unavailable right now. I won't fall back to a public route without asking you." };
    }
  }
  const quoteOnly = routes.some((r) => !r.isExecutable);

  return {
    routes,
    skipped,
    message: routes.length === 0
      ? "No valid quote is currently available."
      : quoteOnly
        ? `${routes.length} live quote(s) found. Swap execution is not enabled yet.`
        : `${routes.length} executable routes found.`,
  };
}
