import { listAssets, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { capabilitiesForDeployment, deploymentFacts, executionLive } from "@/lib/deployment-capabilities";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Machine-readable integration status.
 *
 * The registry stays the same in every environment; this endpoint additionally
 * reports what *this deployment* can run. Execution-related entries only turn
 * green when swap execution is enabled here and a database is configured.
 */
export async function GET() {
  const facts = deploymentFacts();
  return jsonOk({
    chainId: ROBINHOOD_CHAIN_ID,
    assets: listAssets(),
    deployment: facts,
    executionLive: executionLive(facts),
    capabilities: capabilitiesForDeployment(facts),
  });
}
