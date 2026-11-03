
import { rankQuotes } from "./rank.ts";
import type { QuoteAdapter, QuoteRequest, QuoteResult } from "./types.ts";

export interface CollectOptions {
  timeoutMs?: number;
  now?: number;
  maxRoutes?: number;
}

async function runAdapter(
  adapter: QuoteAdapter,
  req: QuoteRequest,
  timeoutMs: number,
): Promise<Awaited<ReturnType<QuoteAdapter["quote"]>>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Quote adapter timed out."));
      }, timeoutMs);
    });

    return await Promise.race([
      adapter.quote(req, controller.signal),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

export async function collectQuotes(
  req: QuoteRequest,
  adapters: readonly QuoteAdapter[],
  opts: CollectOptions = {},
): Promise<QuoteResult> {
  const timeoutMs = Math.max(1, Math.min(opts.timeoutMs ?? 4000, 30000));
  const now = opts.now ?? Date.now();
  const maxRoutes = Math.max(1, Math.min(opts.maxRoutes ?? 5, 5));

  const skipped: QuoteResult["skipped"] = [];

  const live = adapters.filter((adapter) => {
    if (adapter.status !== "verified") {
      skipped.push({
        adapterId: adapter.id,
        reason: `status: ${adapter.status}`,
      });
      return false;
    }
    return true;
  });

  if (live.length === 0) {
    return {
      routes: [],
      skipped,
      message: "No verified route is connected yet. Nothing was invented.",
    };
  }

  const settled = await Promise.allSettled(
    live.map((adapter) => runAdapter(adapter, req, timeoutMs)),
  );

  const all = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;

    skipped.push({
      adapterId: live[index]!.id,
      reason: "failed or timed out",
    });

    return [];
  });

  let routes = rankQuotes(all, req, Date.now(), maxRoutes, true);

  // Preserve deterministic time in tests when explicitly provided.
  if (opts.now !== undefined) {
    routes = rankQuotes(all, req, opts.now, maxRoutes, true);
  }

  if (req.privateRequested) {
    routes = routes.filter(
      (route) => route.verifiedPrivacyRelay === true,
    );

    if (routes.length === 0) {
      return {
        routes: [],
        skipped,
        message:
          "Private submission is unavailable right now. I won't fall back to a public route without asking you.",
      };
    }
  }

  const quoteOnly = routes.some((route) => !route.isExecutable);

  return {
    routes,
    skipped,
    message:
      routes.length === 0
        ? "No valid quote is currently available."
        : quoteOnly
          ? `${routes.length} live quote(s) found. Swap execution is not enabled yet.`
          : `${routes.length} executable routes found.`,
  };
}
