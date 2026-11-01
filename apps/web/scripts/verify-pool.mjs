import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyChain, verifyV4Pool } from "./verify-chain.mjs";

async function main() {
  const config = {
    primaryUrl: process.env.ROBINHOOD_RPC_URL_PRIMARY,
    secondaryUrl: process.env.ROBINHOOD_RPC_URL_SECONDARY,
    usdgAddress: process.env.ROBINHOOD_USDG_ADDRESS,
  };
  const chain = await verifyChain(config);
  const pool = await verifyV4Pool({
    ...config,
    commonBlock: chain.commonBlock,
    fee: process.env.ROBINHOOD_POOL_FEE,
    tickSpacing: process.env.ROBINHOOD_POOL_TICK_SPACING,
    hooksAddress: process.env.ROBINHOOD_POOL_HOOKS_ADDRESS,
  });
  console.log(JSON.stringify({ chain, pool }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Pool verification failed.");
    process.exitCode = 1;
  });
}
