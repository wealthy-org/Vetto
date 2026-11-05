import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalJson,
  fingerprintPayload,
  fingerprintQuote,
  sameDigest,
  sha256Hex,
} from "./quote-fingerprint.ts";

import { nextStatus } from "./executions.ts";
import { POOL_VENUES, findVenue, swapExecutionEnabled } from "./robinhood-chain.ts";

const reviewed = {
  chainId: 4663,
  venueId: "rh-v4-eth-usdg-500",
  tokenIn: "ETH",
  tokenOut: "USDG",
  amountInBaseUnits: "1000000000000000",
  minOutBaseUnits: "24100000",
  slippageBps: 50,
  router: "0x8876789976decbfcbbbe364623c63652db8c0904",
};

test("canonical JSON sorts keys at every depth so digests are stable", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: { d: 1, c: [{ b: 1, a: 2 }] } }), '{"a":{"c":[{"a":2,"b":1}],"d":1}}');
  assert.equal(canonicalJson([1, "two", null, true]), '[1,"two",null,true]');
  assert.throws(() => canonicalJson({ a: Number.NaN }), /Non-finite/);
});

test("quote fingerprint ignores key order but changes with any reviewed field", () => {
  const base = fingerprintQuote(reviewed);
  assert.match(base, /^[0-9a-f]{64}$/);

  const reordered = fingerprintQuote({
    router: reviewed.router,
    slippageBps: reviewed.slippageBps,
    minOutBaseUnits: reviewed.minOutBaseUnits,
    amountInBaseUnits: reviewed.amountInBaseUnits,
    tokenOut: reviewed.tokenOut,
    tokenIn: reviewed.tokenIn,
    venueId: reviewed.venueId,
    chainId: reviewed.chainId,
  });
  assert.equal(reordered, base);

  for (const change of [
    { amountInBaseUnits: "2000000000000000" },
    { minOutBaseUnits: "24000000" },
    { slippageBps: 100 },
    { venueId: "rh-v4-eth-usdg-3000" },
    { tokenIn: "USDG", tokenOut: "ETH" },
    { chainId: 1 },
    { router: "0x204faca1764b154221e35c0d20abb3c525710498" },
  ]) {
    assert.notEqual(fingerprintQuote({ ...reviewed, ...change }), base, JSON.stringify(change));
  }
});

test("payload fingerprint is sensitive to to/data/value/deadline", () => {
  const payload = {
    chainId: 4663,
    to: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    data: "0x3593564cdeadbeef" as const,
    value: "1000000000000000",
    deadline: "1800000000",
  };

  const base = fingerprintPayload(payload);
  assert.match(base, /^[0-9a-f]{64}$/);
  // Destination checksum casing is irrelevant, bytes are not.
  assert.equal(fingerprintPayload({ ...payload, to: payload.to.toLowerCase() }), base);

  assert.notEqual(fingerprintPayload({ ...payload, data: "0x3593564cdeadbeee" }), base);
  assert.notEqual(fingerprintPayload({ ...payload, value: "1000000000000001" }), base);
  assert.notEqual(fingerprintPayload({ ...payload, deadline: "1800000001" }), base);
  assert.notEqual(fingerprintPayload({ ...payload, chainId: 1 }), base);
});

test("sameDigest only accepts equal 32-byte hex digests", () => {
  const digest = sha256Hex("hello");
  assert.equal(sameDigest(digest, digest), true);
  assert.equal(sameDigest(digest, sha256Hex("hellp")), false);
  assert.equal(sameDigest(digest, digest.toUpperCase()), false);
  assert.equal(sameDigest(digest, undefined), false);
  assert.equal(sameDigest("0x1234", "0x1234"), false);
});

test("execution status only reaches confirmed or reverted through a receipt", () => {
  assert.equal(nextStatus("prepared", null), "submitted");
  assert.equal(nextStatus("submitted", null), "submitted");
  assert.equal(nextStatus("submitted", { status: "success" }), "confirmed");
  assert.equal(nextStatus("submitted", { status: "reverted" }), "reverted");
  assert.equal(nextStatus("confirmed", { status: "reverted" }), "reverted");
});

test("swap execution is opt-in in production and opt-out in development", () => {
  assert.equal(swapExecutionEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
  assert.equal(
    swapExecutionEnabled({ NODE_ENV: "production", VETTO_SWAP_EXECUTION: "on" } as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    swapExecutionEnabled({ NODE_ENV: "production", VETTO_SWAP_EXECUTION: "off" } as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(swapExecutionEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
  assert.equal(
    swapExecutionEnabled({ NODE_ENV: "development", VETTO_SWAP_EXECUTION: "off" } as NodeJS.ProcessEnv),
    false,
  );
});

test("venue registry only exposes the verified ETH/USDG pool keys", () => {
  assert.equal(POOL_VENUES.length, 3);
  for (const venue of POOL_VENUES) {
    assert.equal(venue.poolKey.currency0, "0x0000000000000000000000000000000000000000");
    assert.equal(venue.poolKey.currency1, "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
    assert.equal(venue.poolKey.hooks, "0x0000000000000000000000000000000000000000");
    assert.ok([500, 3000, 10000].includes(venue.poolKey.fee));
  }

  assert.equal(findVenue("rh-v4-eth-usdg-500")?.poolKey.tickSpacing, 10);
  assert.equal(findVenue("rh-v4-eth-usdg-3000")?.poolKey.tickSpacing, 60);
  assert.equal(findVenue("rh-v4-eth-usdg-10000")?.poolKey.tickSpacing, 200);
  assert.equal(findVenue("rh-v4-eth-usdg-999"), undefined);
});
