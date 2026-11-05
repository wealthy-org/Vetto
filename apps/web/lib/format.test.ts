import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAmount } from "./format.ts";

test("formatAmount: never rounds a minimum up past what arrives", () => {
  // 0.041032793876775 ETH must display as a floor, not 0.041033.
  assert.equal(formatAmount("41032793876775040", 18), "0.041032");
  assert.equal(formatAmount("24138038", 6), "24.138038");
});

test("formatAmount: trims trailing zeros and keeps whole numbers clean", () => {
  assert.equal(formatAmount("1000000000000000000", 18), "1");
  assert.equal(formatAmount("2500000000", 6), "2500");
  assert.equal(formatAmount("0", 18), "0");
});

test("formatAmount: dust below the display floor is labelled, never shown as 0", () => {
  assert.equal(formatAmount("1", 18), "<0.000001");
  assert.equal(formatAmount("1", 18, 8), "<0.00000001");
});
