import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as intent } from "../app/api/intent/route.ts";
import { POST as quotes } from "../app/api/quotes/route.ts";
import { POST as inspect } from "../app/api/inspect/route.ts";
import { POST as prepare } from "../app/api/execute/prepare/route.ts";
import { GET as caps } from "../app/api/capabilities/route.ts";

const BASE = "http://localhost:3000";
let n = 0; // IP unik per tes → rate limiter tidak saling mengganggu
const ip = () => `10.0.${Math.floor(++n / 250)}.${n % 250}`;

const post = (path: string, body: unknown, over: Record<string, string> = {}, raw?: string) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": ip(), ...over },
    body: raw ?? JSON.stringify(body),
  });
const j = async (r: Response) => (await r.json()) as any;

test("POST /api/intent: swap → typed intent + interpretation line", async () => {
  const r = await intent(post("/api/intent", { text: "swap 10 USDG to ETH" }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const b = await j(r);
  assert.deepEqual(b.intent, { kind: "swap", chainId: 4663, tokenIn: "USDG", tokenOut: "ETH", amountIn: "10", privateRequested: false });
  assert.match(b.label, /Robinhood Chain/);
});

test("POST /api/intent: ambiguous → clarification, never guesses a token", async () => {
  const b = await j(await intent(post("/api/intent", { text: "swap 500 USDG" })));
  assert.equal(b.intent.kind, "clarification");
  assert.deepEqual(b.intent.choices, ["swap 500 USDG to ETH"]);
});

test("follow-up uses context.lastUrl", async () => {
  const b = await j(await intent(post("/api/intent", { text: "open it live", context: { lastUrl: "https://demo-dex.app/" } })));
  assert.deepEqual(b.intent, { kind: "live-browser", action: "start", url: "https://demo-dex.app/" });
});

test("guard: cross-origin, missing origin, non-JSON, bad JSON, oversize, wrong shape", async () => {
  assert.equal((await intent(post("/api/intent", { text: "x" }, { origin: "https://evil.example" }))).status, 403);
  const noOrigin = new Request(`${BASE}/api/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await intent(noOrigin)).status, 403);
  assert.equal((await intent(post("/api/intent", {}, { "content-type": "text/plain" }))).status, 415);
  assert.equal((await intent(post("/api/intent", null, {}, "{oops"))).status, 400);
  assert.equal((await intent(post("/api/intent", { text: "a".repeat(5000) }))).status, 413);
  assert.equal((await intent(post("/api/intent", { text: 123 }))).status, 400);
});

test("rate limit: 31st request from one IP → 429 + Retry-After; other IPs unaffected", async () => {
  const same = { "x-forwarded-for": "198.51.100.9" };
  let last: Response | undefined;
  for (let i = 0; i < 31; i++) last = await intent(post("/api/intent", { text: "hi" }, same));
  assert.equal(last!.status, 429);
  assert.ok(Number(last!.headers.get("retry-after")) >= 1);
  assert.equal((await intent(post("/api/intent", { text: "hi" }))).status, 200);
});

test("POST /api/quotes: unverified assets → empty routes + honest message", async () => {
  const { intent: it } = await j(await intent(post("/api/intent", { text: "swap 10 USDG to ETH" })));
  const r = await quotes(post("/api/quotes", { intent: it }));
  assert.equal(r.status, 200);
  const b = await j(r);
  assert.deepEqual(b.routes, []);
  assert.match(b.message, /not verified/);
});

test("POST /api/quotes: wrong chain, non-swap, raw address from an LLM, unknown token are rejected", async () => {
  const swap = (o: object) => ({ intent: { kind: "swap", chainId: 4663, tokenIn: "USDG", tokenOut: "ETH", amountIn: "1", privateRequested: false, ...o } });
  assert.equal((await quotes(post("/api/quotes", { intent: { kind: "chat", text: "hi" } }))).status, 400);
  assert.equal((await quotes(post("/api/quotes", swap({ chainId: 1 })))).status, 400);
  assert.equal((await quotes(post("/api/quotes", swap({ tokenOut: "0xdeadbeef00000000000000000000000000000000" })))).status, 400);
  assert.equal((await quotes(post("/api/quotes", swap({ tokenOut: "PEPE" })))).status, 422);
});

test("POST /api/execute/prepare: requires a valid idempotency key and authenticated session", async () => {
  const intent = { kind: "swap", chainId: 4663, tokenIn: "USDG", tokenOut: "ETH", amountIn: "1", privateRequested: false };
  const key = "00000000-0000-4000-8000-000000000001";
  assert.equal((await prepare(post("/api/execute/prepare", { intent }))).status, 400);
  const response = await prepare(post("/api/execute/prepare", { intent }, { "idempotency-key": key }));
  assert.equal(response.status, 401);
  assert.deepEqual(await j(response), { error: "Sign in before preparing a transaction." });
});

test("POST /api/inspect: rejects SSRF targets and reports possible brand lookalikes cautiously", async () => {
  for (const u of ["https://169.254.169.254/latest", "https://localhost/", "https://2130706433/", "http://example.com"]) {
    const b = await j(await inspect(post("/api/inspect", { url: u })));
    assert.equal(b.host, null, u);
    assert.equal(b.report.band, "dangerous", u);
  }
  const ok = await j(await inspect(post("/api/inspect", { url: "https://demo-dex.app/swap" })));
  assert.equal(ok.host, "demo-dex.app");
  assert.equal(ok.report.band, "insufficient evidence");
  assert.ok(ok.report.checksUnavailable.length > 0);

  const lookalike = await j(await inspect(post("/api/inspect", { url: "https://r0binhood-login.example" })));
  assert.equal(lookalike.host, "r0binhood-login.example");
  assert.equal(lookalike.report.band, "insufficient evidence");
  assert.equal(lookalike.report.findings[0].title, "Possible brand lookalike");
  assert.match(lookalike.report.findings[0].uncertainty, /heuristic only/);
});

test("GET /api/capabilities: no external capability or asset is claimed as verified", async () => {
  const b = await j(await caps());
  assert.equal(b.chainId, 4663);
  const ext = b.capabilities.filter((c: any) => /^(route-|transaction-|private-|wallet-|dapp-|agent-|live-)/.test(c.id));
  assert.ok(ext.length > 0 && ext.every((c: any) => c.status !== "verified"));
  assert.ok(b.assets.every((a: any) => a.status === "unverified"));
});