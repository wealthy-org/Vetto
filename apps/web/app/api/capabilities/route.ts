import { listAssets, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { CAPABILITIES } from "@vetto/quote-engine";
import { jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/** Machine-readable integration status; external features stay disabled until verified. */
export async function GET() {
  return jsonOk({
    chainId: ROBINHOOD_CHAIN_ID,
    assets: listAssets(),
    capabilities: CAPABILITIES,
  });
}
