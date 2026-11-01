import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, MemoryRateLimiter, PostgresRateLimiter } from "./rate-limit.ts";

test("production limiter fails closed without database configuration", async () => {
  const limiter = createRateLimiter({ NODE_ENV: "production" });
  await assert.rejects(() => limiter.hit("intent:local", 2, 60_000), /DATABASE_URL is required/);

  const invalidSaltLimiter = createRateLimiter({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://db.example.test/vetto",
    RATE_LIMIT_SALT: "change-me",
  });
  await assert.rejects(() => invalidSaltLimiter.hit("intent:local", 2, 60_000), /RATE_LIMIT_SALT/);
});

test("memory limiter rejects requests after the configured limit", async () => {
  const limiter = new MemoryRateLimiter();
  assert.deepEqual(await limiter.hit("intent:local", 2, 60_000), { ok: true, retryAfterSec: 0 });
  assert.deepEqual(await limiter.hit("intent:local", 2, 60_000), { ok: true, retryAfterSec: 0 });
  const blocked = await limiter.hit("intent:local", 2, 60_000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0);
});

test("Postgres limiter shares an atomic fixed-window limit across instances and hashes keys", async () => {
  let now = 120_000;
  const rows = new Map<string, number>();
  const database = {
    async query(_sql: string, values: readonly unknown[]) {
      if (_sql.startsWith("delete")) return { rowCount: 0 };
      const [hashedKey, windowStart, max] = values as [string, number, number];
      const key = `${hashedKey}:${windowStart}`;
      const hits = rows.get(key) ?? 0;
      if (hits >= max) return { rowCount: 0 };
      rows.set(key, hits + 1);
      return { rowCount: 1 };
    },
  };
  const firstInstance = new PostgresRateLimiter(database, "test-secret-salt", () => now);
  const secondInstance = new PostgresRateLimiter(database, "test-secret-salt", () => now);

  assert.deepEqual(await firstInstance.hit("quotes:203.0.113.8", 2, 60_000), { ok: true, retryAfterSec: 0 });
  assert.deepEqual(await secondInstance.hit("quotes:203.0.113.8", 2, 60_000), { ok: true, retryAfterSec: 0 });
  assert.deepEqual(await firstInstance.hit("quotes:203.0.113.8", 2, 60_000), { ok: false, retryAfterSec: 60 });
  assert.ok([...rows.keys()].every((key) => !key.includes("203.0.113.8")));

  now += 60_000;
  assert.deepEqual(await secondInstance.hit("quotes:203.0.113.8", 2, 60_000), { ok: true, retryAfterSec: 0 });
});
