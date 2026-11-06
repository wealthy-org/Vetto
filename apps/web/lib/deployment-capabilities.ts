import { CAPABILITIES, type Capability } from "@vetto/quote-engine";
import { swapExecutionEnabled } from "./robinhood-chain";

/**
 * Deployment-aware capability view.
 *
 * The registry in `@vetto/quote-engine` describes what has been *integrated and
 * exercised*; it never changes per environment. This resolver answers a
 * narrower, per-deployment question: on this deployment, which of the
 * execution-related capabilities can actually run end to end?
 *
 * The three ids below are implemented, tested and fail-closed. They only turn
 * green when the deployment is genuinely able to carry a transaction: swap
 * execution enabled by the operator (normally after a funded receipt test) and
 * a database present for the execution record. Anything else — a relay, a
 * solver, a burner machine — has no code and no counterparty, so it is never
 * promoted here. A deploy makes the app reachable; it does not create those.
 */
const EXECUTION_IDS = ["permit2-approval", "transaction-prepare", "execution-history"] as const;

export type DeploymentFacts = {
  executionEnabled: boolean;
  databaseConfigured: boolean;
};

export function deploymentFacts(
  environment: NodeJS.ProcessEnv = process.env,
  probe: { databaseReachable?: boolean } = {},
): DeploymentFacts {
  return {
    executionEnabled: swapExecutionEnabled(environment),
    databaseConfigured:
      typeof environment.DATABASE_URL === "string" &&
      environment.DATABASE_URL.trim().length > 0 &&
      probe.databaseReachable !== false,
  };
}

const PROMOTED_NOTE: Record<(typeof EXECUTION_IDS)[number], string> = {
  "permit2-approval":
    "Enabled on this deployment: the exact amount and a 30-day expiry, signed by you in two separate steps.",
  "transaction-prepare":
    "Enabled on this deployment: the payload is rebuilt, simulated from your wallet and re-checked against the reviewed minimum before signing.",
  "execution-history":
    "Enabled on this deployment: status moves to confirmed only when the chain returns a matching receipt.",
};

export function capabilitiesForDeployment(facts: DeploymentFacts): Capability[] {
  const live = facts.executionEnabled && facts.databaseConfigured;

  return CAPABILITIES.map((capability) => {
    if (!live || !(EXECUTION_IDS as readonly string[]).includes(capability.id)) return capability;
    return {
      ...capability,
      status: "verified" as const,
      note: PROMOTED_NOTE[capability.id as (typeof EXECUTION_IDS)[number]],
    };
  });
}

/** True when this deployment can actually submit a signed swap. Used by docs copy, not by styling. */
export function executionLive(facts: DeploymentFacts): boolean {
  return facts.executionEnabled && facts.databaseConfigured;
}
