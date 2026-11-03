import { Pool } from "pg";

const g = globalThis as typeof globalThis & {
  __vettoPostgresPool?: Pool;
  __vettoTestPostgresPool?: Pool;
};

/**
 * Hanya untuk dependency injection pada automated tests.
 * Tidak boleh digunakan di production.
 */
export function setPoolForTests(pool: Pool | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Test database injection is only available in test mode.");
  }

  g.__vettoTestPostgresPool = pool;
}

/**
 * Satu pool untuk seluruh app.
 */
export function getPool(connectionString: string): Pool {
  if (process.env.NODE_ENV === "test") {
    if (!g.__vettoTestPostgresPool) {
      throw new Error("Test PostgreSQL pool is not configured.");
    }

    return g.__vettoTestPostgresPool;
  }

  return (g.__vettoPostgresPool ??= new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  }));
}