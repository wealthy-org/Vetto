import { test } from "node:test";
import assert from "node:assert/strict";
import { collectQuotes, rankQuotes, CAPABILITIES, type QuoteAdapter, type QuoteRequest, type RouteQuote } from "./index.ts";

const req: QuoteRequest = { chainId: 4663, tokenIn: "USDG", tokenOut: "ETH", amountInBaseUnits: "10000000", slippageBps: 50, privateRequested: false };
const NOW = 1_000_000;
const q = (o: Partial<RouteQuote>): RouteQuote => ({
  quoteId: "q", routeType: "direct", provider: "test-double", tokenIn: "USDG", tokenOut: "ETH", amountInBaseUnits: "10000000",
  expectedOutBaseUnits: "1000", minOutBaseUnits: "995", networkFeeEstimate: "1", protocolFeeEstimate: "1",
  executableUntil: new Date(NOW + 30_000).toISOString(), executionPathId: "p", isExecutable: true, ...o,
});
const adapter = (status: QuoteAdapter["status"], quotes: RouteQuote[]): QuoteAdapter => ({ id: `a-${status}`, status, quote: async () => quotes });

test("no verified adapter => zero routes, never a fabricated list", async () => {
  const r = await collectQuotes(req, [adapter("planned", [q({})])], { now: NOW });
  assert.equal(r.routes.length, 0);
  assert.equal(r.skipped.length, 1);
});

test("ranks by net output and filters expired / non-executable / mismatched / incoherent quotes", () => {
  const good = q({ quoteId: "good", expectedOutBaseUnits: "1100" });
  const worse = q({ quoteId: "worse", expectedOutBaseUnits: "1050" });
  const cheapButFeeHeavy = q({ quoteId: "fee", expectedOutBaseUnits: "1200", networkFeeEstimate: "300" });
  const bad = [
    q({ quoteId: "expired", executableUntil: new Date(NOW - 1).toISOString() }),
    q({ quoteId: "noexec", isExecutable: false }),
    q({ quoteId: "pair", tokenOut: "USDG" }),
    q({ quoteId: "amount", amountInBaseUnits: "1" }),
    q({ quoteId: "minHigh", minOutBaseUnits: "2000" }),
    q({ quoteId: "float", expectedOutBaseUnits: "1.5" }),
  ];
  const ids = rankQuotes([worse, ...bad, cheapButFeeHeavy, good], req, NOW).map((x) => x.quoteId);
  assert.deepEqual(ids, ["good", "worse", "fee"]);
});

test("caps at five routes", () => {
  const many = Array.from({ length: 8 }, (_, i) => q({ quoteId: `r${i}`, expectedOutBaseUnits: String(1000 + i) }));
  assert.equal(rankQuotes(many, req, NOW).length, 5);
});

test("private request never silently downgrades to public routes", async () => {
  const r = await collectQuotes({ ...req, privateRequested: true }, [adapter("verified", [q({})])], { now: NOW });
  assert.equal(r.routes.length, 0);
  assert.match(r.message, /unavailable/i);
  const ok = await collectQuotes({ ...req, privateRequested: true }, [adapter("verified", [q({ routeType: "private", verifiedPrivacyRelay: true })])], { now: NOW });
  assert.equal(ok.routes.length, 1);
});

test("a failing adapter is reported, not fatal", async () => {
  const boom: QuoteAdapter = { id: "boom", status: "verified", quote: async () => { throw new Error("rpc down"); } };
  const r = await collectQuotes(req, [boom, adapter("verified", [q({})])], { now: NOW });
  assert.equal(r.routes.length, 1);
  assert.deepEqual(r.skipped, [{ adapterId: "boom", reason: "failed or timed out" }]);
});

test("capability registry is honest: no external capability is marked verified without an integration", () => {
  const ext = CAPABILITIES.filter((c) => /^(route-|private-|wallet-|dapp-|agent-|live-)/.test(c.id));
  assert.ok(ext.length > 0 && ext.every((c) => c.status !== "verified"));
});
