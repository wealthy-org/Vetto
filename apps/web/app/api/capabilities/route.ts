import { listAssets, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { capabilitiesForDeployment, deploymentFacts, executionLive } from "@/lib/deployment-capabilities";
import { activeProfile, profileMismatch } from "@/lib/chain-profile";
import { llmCooldownRemaining } from "@/lib/llm-parser";
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
  const facts = deploymentFacts(process.env, { llmCooldownMs: llmCooldownRemaining() });
  const profile = activeProfile();
  return jsonOk({
    chainId: ROBINHOOD_CHAIN_ID,
    chain: {
      profile: profile.key,
      name: profile.name,
      testnet: profile.isTestnet,
      // A build whose NEXT_PUBLIC_* value disagrees with the server value would
      // render one chain and transact on another. Reported, never auto-corrected.
      profileMismatch: profileMismatch(process.env),
    },
    assets: listAssets(),
    deployment: facts,
    executionLive: executionLive(facts),
    // "cooling" means the provider rejected the key recently: the deterministic parser
    // handles everything until the cooldown expires. Nothing is simulated.
    llmParser: facts.llmParser,
    capabilities: capabilitiesForDeployment(facts),
  });
}
