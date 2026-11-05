import assert from "node:assert/strict";
import { test } from "node:test";

import { failureFields, setupHint } from "./setup-hints.ts";

test("setupHint: missing rate-limit salt names the env var and how to make one", () => {
  const hint = setupHint(new Error("Configure RATE_LIMIT_SALT with at least 32 non-default characters."));
  assert.equal(hint?.code, "RATE_LIMIT_SALT_MISSING");
  assert.match(hint?.hint ?? "", /openssl rand -hex 32/);
});

test("setupHint: unmigrated database points at pnpm db:migrate", () => {
  const error = Object.assign(new Error('relation "wallet_auth_challenges" does not exist'), { code: "42P01" });
  assert.equal(setupHint(error)?.code, "SCHEMA_MISSING");
  assert.match(setupHint(error)?.hint ?? "", /pnpm db:migrate/);
});

test("setupHint: wrong database, bad credentials and no listener are distinct", () => {
  assert.equal(setupHint(Object.assign(new Error("x"), { code: "3D000" }))?.code, "DATABASE_MISSING");
  assert.equal(setupHint(Object.assign(new Error("x"), { code: "28P01" }))?.code, "DATABASE_REJECTED");
  assert.equal(setupHint(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432")))?.code, "DATABASE_UNREACHABLE");
});

test("setupHint: unknown failures stay unexplained instead of guessing", () => {
  assert.equal(setupHint(new Error("something else entirely")), undefined);
  assert.deepEqual(failureFields(new Error("something else entirely")), {});
});

test("setupHint: never leaks the driver message into the client fields", () => {
  const error = Object.assign(new Error("password authentication failed for user \"secret_user\""), { code: "28P01" });
  const fields = failureFields(error);
  assert.ok(!JSON.stringify(fields).includes("secret_user"));
});
