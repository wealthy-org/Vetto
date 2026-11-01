import { Pool } from "pg";

const g = globalThis as typeof globalThis & { __vettoPostgresPool?: Pool };

/**
 * Satu pool untuk seluruh app (rate limit, audit, idempotency, nanti pg-boss).
 * Di Neon pakai connection string *pooled* (host berakhiran -pooler) supaya serverless tidak menghabiskan koneksi.
 */
export function getPool(connectionString: string): Pool {
  return (g.__vettoPostgresPool ??= new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 }));
}