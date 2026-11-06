import test from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES } from "@vetto/quote-engine";
import { capabilitiesForDeployment, deploymentFacts, executionLive } from "./deployment-capabilities.ts";

const OFF = deploymentFacts({ NODE_ENV: "production", DATABASE_URL: "postgres://x" } as NodeJS.ProcessEnv);
const ON = deploymentFacts({
  NODE_ENV: "production",
  VETTO_SWAP_EXECUTION: "on",
  DATABASE_URL: "postgres://x",
} as NodeJS.ProcessEnv);
const ON_NO_DB = deploymentFacts({ NODE_ENV: "production", VETTO_SWAP_EXECUTION: "on" } as NodeJS.ProcessEnv);

test("with execution off nothing is promoted", () => {
  const resolved = capabilitiesForDeployment(OFF);
  assert.deepEqual(resolved.map((c) => c.status), CAPABILITIES.map((c) => c.status));
  assert.equal(executionLive(OFF), false);
});

test("execution without a database stays off: a receipt cannot be recorded", () => {
  const resolved = capabilitiesForDeployment(ON_NO_DB);
  assert.equal(executionLive(ON_NO_DB), false);
  assert.equal(resolved.find((c) => c.id === "transaction-prepare")?.status, "planned");
});

test("an execution-enabled deployment promotes exactly the three implemented steps", () => {
  const resolved = capabilitiesForDeployment(ON);
  const promoted = resolved.filter((c) => c.status === "verified").map((c) => c.id).sort();
  const baseVerified = CAPABILITIES.filter((c) => c.status === "verified").map((c) => c.id);

  assert.deepEqual(
    promoted,
    [...baseVerified, "execution-history", "permit2-approval", "transaction-prepare"].sort(),
  );

  for (const id of ["permit2-approval", "transaction-prepare", "execution-history"]) {
    const entry = resolved.find((c) => c.id === id);
    assert.equal(entry?.status, "verified");
    assert.match(entry!.note, /this deployment/i);
  }
});

test("no counterparty-less capability is ever promoted", () => {
  const resolved = capabilitiesForDeployment(ON);
  for (const id of ["private-relay", "route-split", "route-solver", "route-rfq", "dapp-sandbox", "agent-tasks", "live-browser"]) {
    const entry = resolved.find((c) => c.id === id);
    assert.notEqual(entry?.status, "verified", `${id} has no counterparty and must not be verified`);
  }
});

test("the shared registry is never mutated by the deployment view", () => {
  const before = JSON.stringify(CAPABILITIES);
  capabilitiesForDeployment(ON);
  assert.equal(JSON.stringify(CAPABILITIES), before);
});
