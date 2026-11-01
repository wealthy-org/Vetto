import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as challenge } from "../app/api/auth/challenge/route.ts";
import { POST as verify } from "../app/api/auth/verify/route.ts";
import { GET as session } from "../app/api/auth/session/route.ts";
import { POST as logout } from "../app/api/auth/logout/route.ts";

const BASE = "http://localhost:3000";
let requestId = 0;
const headers = () => ({
  origin: BASE,
  "content-type": "application/json",
  "x-forwarded-for": `10.2.0.${++requestId}`,
});
const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });

test("wallet challenge rejects malformed address before database access", async () => {
  const response = await challenge(post("/api/auth/challenge", { address: "not-an-address" }));
  assert.equal(response.status, 400);
});

test("wallet verification rejects malformed challenge input before database access", async () => {
  const response = await verify(post("/api/auth/verify", {
    challengeId: "not-a-uuid",
    address: "not-an-address",
    signature: "0x1234",
  }));
  assert.equal(response.status, 400);
});

test("session status without a cookie is explicitly unauthenticated", async () => {
  const response = await session(new Request(`${BASE}/api/auth/session`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("sign-out without a session clears the cookie and remains idempotent", async () => {
  const response = await logout(post("/api/auth/logout", {}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});
