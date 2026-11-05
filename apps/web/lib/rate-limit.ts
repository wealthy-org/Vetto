import { createHmac } from "node:crypto";
import { getPool } from "./db";

/**
 * Rate limiting behind an interface so the store can change without touching routes.
 * The in-memory store is for local development only. Production requires Postgres
 * (see db/migrations/0001_init.sql, table rate_limits); there is no Redis or silent fallback.
 */
export interface RateLimiter {
  hit(key: string, max: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }>;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async hit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0]!)) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [storedKey, timestamps] of this.hits) {
        if (timestamps.every((timestamp) => now - timestamp >= windowMs)) this.hits.delete(storedKey);
      }
    }
    return { ok: true, retryAfterSec: 0 };
  }
}

interface RateLimitDatabase {
  query(text: string, values: readonly unknown[]): Promise<{ rowCount: number | null }>;
}

export class PostgresRateLimiter implements RateLimiter {
  private readonly database: RateLimitDatabase;
  private readonly keySalt: string;
  private readonly now: () => number;
  private nextCleanupAt = 0;

  constructor(
    database: RateLimitDatabase,
    keySalt: string,
    now: () => number = Date.now,
  ) {
    this.database = database;
    this.keySalt = keySalt;
    this.now = now;
  }

  async hit(key: string, max: number, windowMs: number) {
    const now = this.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const hashedKey = createHmac("sha256", this.keySalt).update(key).digest("hex");
    if (now >= this.nextCleanupAt) {
      await this.database.query(
        "delete from rate_limits where window_start < to_timestamp($1 / 1000.0) - interval '24 hours'",
        [now],
      );
      this.nextCleanupAt = now + 60_000;
    }
    const result = await this.database.query(
      `insert into rate_limits (key, window_start, hits)
       values ($1, to_timestamp($2 / 1000.0), 1)
       on conflict (key, window_start) do update
         set hits = rate_limits.hits + 1
         where rate_limits.hits < $3
       returning hits`,
      [hashedKey, windowStart, max],
    );

    return {
      ok: result.rowCount === 1,
      retryAfterSec: result.rowCount === 1
        ? 0
        : Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
    };
  }
}

class UnavailableRateLimiter implements RateLimiter {
  private readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }

  async hit(): Promise<{ ok: boolean; retryAfterSec: number }> {
    throw new Error(this.reason);
  }
}

const globalState = globalThis as typeof globalThis & {
  __vettoLimiter?: RateLimiter;
};

interface RateLimitEnvironment {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  RATE_LIMIT_SALT?: string;
  /** Explicit opt-in for demo/preview deployments without a database. */
  VETTO_ALLOW_MEMORY_LIMITS?: string;
}

let warnedMemoryOnly = false;

export function createRateLimiter(environment: RateLimitEnvironment = process.env): RateLimiter {
  if (!environment.DATABASE_URL) {
    if (environment.NODE_ENV !== "production") return new MemoryRateLimiter();

    // A production build without a database would otherwise refuse every request.
    // Operators may opt into a process-local limiter for a throwaway preview, but
    // it is never silent: the limitation is logged once at startup.
    const opted = (environment.VETTO_ALLOW_MEMORY_LIMITS ?? "").trim().toLowerCase();
    if (opted === "1" || opted === "true" || opted === "on") {
      if (!warnedMemoryOnly) {
        warnedMemoryOnly = true;
        console.warn(
          "VETTO_ALLOW_MEMORY_LIMITS is on: rate limits are process-local and reset on restart. " +
            "Not suitable for production traffic; configure DATABASE_URL instead.",
        );
      }
      return new MemoryRateLimiter();
    }

    return new UnavailableRateLimiter("DATABASE_URL is required for production rate limiting.");
  }

  const salt = environment.RATE_LIMIT_SALT;
  if (!salt || salt.length < 32 || salt === "change-me") {
    return new UnavailableRateLimiter("Configure RATE_LIMIT_SALT with at least 32 non-default characters.");
  }

  const pool = getPool(environment.DATABASE_URL);
  return new PostgresRateLimiter(
    { query: (text, values) => pool.query(text, [...values]) },
    salt,
  );
}

export const rateLimiter: RateLimiter = globalState.__vettoLimiter ??= createRateLimiter();
