import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, getAddress } from "viem";

import { allowancesSatisfied, planApprovals, type AllowanceSnapshot } from "./permit2-approval.ts";
import { CONTRACTS, ERC20_ABI, PERMIT2_ABI } from "./robinhood-chain.ts";

const OWNER = getAddress("0x00c2da0000000000000000000000000000000000");
const TOKEN = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const NOW = 1_800_000_000;

function snapshot(overrides: Partial<AllowanceSnapshot> = {}): AllowanceSnapshot {
  return {
    token: TOKEN,
    owner: OWNER,
    tokenToPermit2: 0n,
    permit2ToRouter: 0n,
    permit2Expiration: 0,
    required: 100_000_000n, // 100 USDG at 6 decimals
    nowSeconds: NOW,
    ...overrides,
  };
}

test("planApprovals: a fresh wallet needs both approvals, ERC-20 first", () => {
  const plan = planApprovals(snapshot());
  assert.equal(plan.satisfied, false);
  assert.deepEqual(
    plan.steps.map((step) => step.purpose),
    ["erc20-approve-permit2", "permit2-approve-router"],
  );
});

test("planApprovals: ERC-20 approval targets the token contract and approves only the required amount", () => {
  const [step] = planApprovals(snapshot()).steps;
  assert.ok(step);
  assert.equal(step.to, TOKEN);
  assert.equal(step.value, "0");

  const decoded = decodeFunctionData({ abi: ERC20_ABI, data: step.data as `0x${string}` });
  assert.equal(decoded.functionName, "approve");
  assert.equal(getAddress(String(decoded.args[0])), getAddress(CONTRACTS.permit2));
  assert.equal(decoded.args[1], 100_000_000n);
});

test("planApprovals: Permit2 approval is scoped to the router, the amount and a finite expiry", () => {
  const steps = planApprovals(snapshot({ tokenToPermit2: 100_000_000n })).steps;
  assert.equal(steps.length, 1);
  const [step] = steps;
  assert.ok(step);
  assert.equal(step.purpose, "permit2-approve-router");
  assert.equal(step.to, getAddress(CONTRACTS.permit2));

  const decoded = decodeFunctionData({ abi: PERMIT2_ABI, data: step.data as `0x${string}` });
  assert.equal(decoded.functionName, "approve");
  assert.equal(getAddress(String(decoded.args[0])), TOKEN);
  assert.equal(getAddress(String(decoded.args[1])), getAddress(CONTRACTS.universalRouter));
  assert.equal(decoded.args[2], 100_000_000n);
  const expiration = Number(decoded.args[3]);
  assert.ok(expiration > NOW, "expiration must be in the future");
  assert.ok(expiration <= NOW + 60 * 60 * 24 * 31, "expiration must not be unbounded");
});

test("planApprovals: nothing to do when both allowances already cover the swap", () => {
  const plan = planApprovals(
    snapshot({ tokenToPermit2: 500_000_000n, permit2ToRouter: 500_000_000n, permit2Expiration: NOW + 3600 }),
  );
  assert.equal(plan.satisfied, true);
  assert.equal(plan.steps.length, 0);
});

test("planApprovals: an expired Permit2 grant is re-planned even when the amount is high enough", () => {
  const plan = planApprovals(
    snapshot({ tokenToPermit2: 500_000_000n, permit2ToRouter: 500_000_000n, permit2Expiration: NOW - 1 }),
  );
  assert.equal(plan.satisfied, false);
  assert.deepEqual(plan.steps.map((step) => step.purpose), ["permit2-approve-router"]);
});

test("planApprovals: the ERC-20 grant is never skipped when it is still short", () => {
  const plan = planApprovals(
    snapshot({ tokenToPermit2: 1n, permit2ToRouter: 500_000_000n, permit2Expiration: NOW + 3600 }),
  );
  assert.deepEqual(plan.steps.map((step) => step.purpose), ["erc20-approve-permit2"]);
});

test("allowancesSatisfied: mirrors the plan for each combination", () => {
  const base = { tokenToPermit2: 500_000_000n, permit2ToRouter: 500_000_000n, permit2Expiration: NOW + 3600 };
  assert.equal(allowancesSatisfied(snapshot(base)), true);
  assert.equal(allowancesSatisfied(snapshot({ ...base, tokenToPermit2: 0n })), false);
  assert.equal(allowancesSatisfied(snapshot({ ...base, permit2ToRouter: 0n })), false);
  assert.equal(allowancesSatisfied(snapshot({ ...base, permit2Expiration: NOW })), false);
});
