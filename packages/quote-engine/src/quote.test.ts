
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectQuotes,
  rankQuotes,
  CAPABILITIES,
  type QuoteAdapter,
  type QuoteRequest,
  type RouteQuote,
} from "./index.ts";

const req: QuoteRequest = {
  chainId: 4663,
  tokenIn: "USDG",
  tokenOut: "ETH",
  amountInBaseUnits: "10000000",
  slippageBps: 50,
  privateRequested: false,
};

const NOW = 1_000_000;

const q = (o: Partial<RouteQuote>): RouteQuote => ({
  quoteId: "q",
  routeType: "direct",
  provider: "test-double",
  tokenIn: "USDG",
  tokenOut: "ETH",
  amountInBaseUnits: "10000000",

  expectedOutBaseUnits: "1000",
  minOutBaseUnits: "995",

  feeEstimatesAvailable: true,
  networkFeeEstimate: "1",
  protocolFeeEstimate: "1",

  executableUntil: new Date(NOW + 30_000).toISOString(),
  executionPathId: "p",
  isExecutable: true,

  ...o,
});

const adapter = (
  status: QuoteAdapter["status"],
  quotes: RouteQuote[],
): QuoteAdapter => ({
  id: `a-${status}`,
  status,
  quote: async () => quotes,
});

test("no verified adapter => zero routes, never a fabricated list", async () => {
  const r = await collectQuotes(
    req,
    [adapter("planned", [q({})])],
    { now: NOW },
  );

  assert.equal(r.routes.length, 0);
  assert.equal(r.skipped.length, 1);
});

test("ranks by net output when all fee estimates are available", () => {
  const good = q({
    quoteId: "good",
    expectedOutBaseUnits: "1100",
  });

  const worse = q({
    quoteId: "worse",
    expectedOutBaseUnits: "1050",
  });

  const cheapButFeeHeavy = q({
    quoteId: "fee",
    expectedOutBaseUnits: "1200",
    networkFeeEstimate: "300",
  });

  const bad = [
    q({
      quoteId: "expired",
      executableUntil: new Date(NOW - 1).toISOString(),
    }),
    q({
      quoteId: "noexec",
      isExecutable: false,
    }),
    q({
      quoteId: "pair",
      tokenOut: "USDG",
    }),
    q({
      quoteId: "amount",
      amountInBaseUnits: "1",
    }),
    q({
      quoteId: "minHigh",
      minOutBaseUnits: "2000",
    }),
    q({
      quoteId: "float",
      expectedOutBaseUnits: "1.5",
    }),
  ];

  const ids = rankQuotes(
    [worse, ...bad, cheapButFeeHeavy, good],
    req,
    NOW,
  ).map((x) => x.quoteId);

  assert.deepEqual(ids, ["good", "worse", "fee"]);
});

test("uses gross output consistently when any route has unavailable fees", () => {
  const highGross = q({
    quoteId: "high-gross",
    expectedOutBaseUnits: "1200",
    feeEstimatesAvailable: false,
    networkFeeEstimate: null,
    protocolFeeEstimate: null,
  });

  const lowerGross = q({
    quoteId: "lower-gross",
    expectedOutBaseUnits: "1100",
    feeEstimatesAvailable: true,
    networkFeeEstimate: "1",
    protocolFeeEstimate: "1",
  });

  const ids = rankQuotes(
    [lowerGross, highGross],
    req,
    NOW,
  ).map((route) => route.quoteId);

  assert.deepEqual(ids, ["high-gross", "lower-gross"]);
});

test("non-executable quotes can be displayed but are rejected by default ranking", async () => {
  const displayOnly = q({
    quoteId: "display-only",
    isExecutable: false,
  });

  assert.equal(
    rankQuotes([displayOnly], req, NOW).length,
    0,
  );

  const displayed = rankQuotes(
    [displayOnly],
    req,
    NOW,
    5,
    true,
  );

  assert.equal(displayed.length, 1);
  assert.equal(displayed[0]?.isExecutable, false);

  const collected = await collectQuotes(
    req,
    [adapter("verified", [displayOnly])],
    { now: NOW },
  );

  assert.equal(collected.routes.length, 1);
  assert.equal(collected.routes[0]?.isExecutable, false);
  assert.match(
    collected.message,
    /execution is not enabled/i,
  );
});

test("preview adapter returns display-only quotes", async () => {
  const r = await collectQuotes(
    req,
    [adapter("preview", [q({ isExecutable: true })])],
    { now: NOW },
  );

  assert.equal(r.routes.length, 1);
  assert.equal(r.routes[0]?.isExecutable, false);
  assert.match(r.message, /execution is not enabled/i);
});

test("caps at five routes", () => {
  const many = Array.from(
    { length: 8 },
    (_, i) =>
      q({
        quoteId: `r${i}`,
        expectedOutBaseUnits: String(1000 + i),
      }),
  );

  assert.equal(rankQuotes(many, req, NOW).length, 5);
});

test("private request never silently downgrades to public routes", async () => {
  const r = await collectQuotes(
    { ...req, privateRequested: true },
    [adapter("verified", [q({})])],
    { now: NOW },
  );

  assert.equal(r.routes.length, 0);
  assert.match(r.message, /unavailable/i);

  const ok = await collectQuotes(
    { ...req, privateRequested: true },
    [
      adapter("verified", [
        q({
          routeType: "private",
          verifiedPrivacyRelay: true,
        }),
      ]),
    ],
    { now: NOW },
  );

  assert.equal(ok.routes.length, 1);
});

test("a failing adapter is reported, not fatal", async () => {
  const boom: QuoteAdapter = {
    id: "boom",
    status: "verified",
    quote: async () => {
      throw new Error("rpc down");
    },
  };

  const r = await collectQuotes(
    req,
    [boom, adapter("verified", [q({})])],
    { now: NOW },
  );

  assert.equal(r.routes.length, 1);

  assert.deepEqual(r.skipped, [
    {
      adapterId: "boom",
      reason: "failed or timed out",
    },
  ]);
});

test("capability registry is honest: no external capability is marked verified without an integration", () => {
  const ext = CAPABILITIES.filter((c) =>
    /^(route-|private-|wallet-|dapp-|agent-|live-)/.test(c.id),
  );

  assert.ok(
    ext.length > 0 &&
    ext.every((c) => c.status !== "verified"),
  );
});

test("a timed-out adapter does not block quote collection", async () => {
  const slow: QuoteAdapter = {
    id: "slow",
    status: "verified",
    quote: async () =>
      new Promise<RouteQuote[]>(() => {
        // Simulates an adapter that ignores AbortSignal.
      }),
  };

  const started = Date.now();

  const result = await collectQuotes(
    req,
    [slow],
    { timeoutMs: 30, now: NOW },
  );

  const elapsed = Date.now() - started;

  assert.equal(result.routes.length, 0);

  assert.deepEqual(result.skipped, [
    {
      adapterId: "slow",
      reason: "failed or timed out",
    },
  ]);

  assert.ok(elapsed < 1000, `Collection took ${elapsed}ms`);
});

test("rejects invalid price impact and latency metrics", () => {
  const invalidQuotes = [
    q({ quoteId: "negative-impact", priceImpactBps: -1 }),
    q({ quoteId: "huge-impact", priceImpactBps: 10001 }),
    q({ quoteId: "fractional-impact", priceImpactBps: 10.5 }),
    q({ quoteId: "nan-impact", priceImpactBps: Number.NaN }),
    q({ quoteId: "negative-latency", latencyMs: -1 }),
    q({ quoteId: "huge-latency", latencyMs: 120001 }),
    q({ quoteId: "fractional-latency", latencyMs: 1.5 }),
  ];

  assert.equal(
    rankQuotes(invalidQuotes, req, NOW).length,
    0,
  );
});

test("rejects oversized numeric fields", () => {
  const invalid = q({
    quoteId: "oversized",
    expectedOutBaseUnits: "9".repeat(79),
  });

  assert.equal(
    rankQuotes([invalid], req, NOW).length,
    0,
  );
});

test("rejects values above uint256 maximum", () => {
  const invalid = q({
    quoteId: "uint256-overflow",
    expectedOutBaseUnits: (1n << 256n).toString(),
  });

  assert.equal(
    rankQuotes([invalid], req, NOW).length,
    0,
  );
});

test("rejects inconsistent fee availability", () => {
  const invalid = q({
    quoteId: "inconsistent-fees",
    feeEstimatesAvailable: false,
    networkFeeEstimate: "0",
    protocolFeeEstimate: null,
  });

  assert.equal(
    rankQuotes([invalid], req, NOW).length,
    0,
  );
});

test("rejects missing fee values when fee estimates are available", () => {
  const invalid = q({
    quoteId: "missing-fees",
    feeEstimatesAvailable: true,
    networkFeeEstimate: null,
    protocolFeeEstimate: "1",
  });

  assert.equal(
    rankQuotes([invalid], req, NOW).length,
    0,
  );
});

test("accepts unavailable fees only when both values are null", () => {
  const valid = q({
    quoteId: "unavailable-fees",
    feeEstimatesAvailable: false,
    networkFeeEstimate: null,
    protocolFeeEstimate: null,
  });

  const result = rankQuotes(
    [valid],
    req,
    NOW,
    5,
    true,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.feeEstimatesAvailable, false);
});

test("caps route count and rejects invalid limits", () => {
  const many = Array.from(
    { length: 8 },
    (_, i) =>
      q({
        quoteId: `limit-${i}`,
        expectedOutBaseUnits: String(1000 + i),
      }),
  );

  assert.equal(rankQuotes(many, req, NOW, 5).length, 5);
  assert.equal(rankQuotes(many, req, NOW, 100).length, 5);
  assert.equal(rankQuotes(many, req, NOW, -1).length, 0);
  assert.equal(rankQuotes(many, req, NOW, 1.5).length, 0);
});

test("private requests accept only verified private quotes", () => {
  const privateReq = {
    ...req,
    privateRequested: true,
  };

  const publicQuote = q({
    quoteId: "public",
  });

  const privateQuote = q({
    quoteId: "private",
    routeType: "private",
    verifiedPrivacyRelay: true,
  });

  assert.equal(
    rankQuotes(
      [publicQuote],
      privateReq,
      NOW,
      5,
      true,
    ).length,
    0,
  );

  assert.equal(
    rankQuotes(
      [privateQuote],
      privateReq,
      NOW,
      5,
      true,
    ).length,
    1,
  );
});