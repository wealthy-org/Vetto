import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverV4Pools, verifyChain, verifyV4Pool } from "./verify-chain.mjs";

async function main() {
  const config = {
    primaryUrl: process.env.ROBINHOOD_RPC_URL_PRIMARY,
    secondaryUrl: process.env.ROBINHOOD_RPC_URL_SECONDARY,
    usdgAddress: process.env.ROBINHOOD_USDG_ADDRESS,
  };
  const fromBlock = process.env.ROBINHOOD_POOL_SCAN_FROM_BLOCK;
  if (!fromBlock) {
    throw new Error("Set ROBINHOOD_POOL_SCAN_FROM_BLOCK to a trusted PoolManager deployment/start block.");
  }
  const rawChunkSize = process.env.ROBINHOOD_POOL_SCAN_CHUNK_SIZE;
  const chunkSize = rawChunkSize === undefined ? 1_000 : Number(rawChunkSize);
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 10_000) {
    throw new Error("ROBINHOOD_POOL_SCAN_CHUNK_SIZE must be a whole number from 1 to 10000.");
  }

  const chain = await verifyChain(config);
  const discovery = await discoverV4Pools({
    ...config,
    fromBlock,
    toBlock: process.env.ROBINHOOD_POOL_SCAN_TO_BLOCK ?? chain.commonBlock,
    chunkSize,
  });
  if (discovery.pools.length > 25) {
    throw new Error(`Found ${discovery.pools.length} pool keys; narrow the scan range before checking state (limit 25).`);
  }

  const checkedPools = [];
  for (const pool of discovery.pools) {
    try {
      const state = await verifyV4Pool({
        ...config,
        commonBlock: chain.commonBlock,
        fee: pool.fee,
        tickSpacing: pool.tickSpacing,
        hooksAddress: pool.hooks,
      });
      if (state.poolId.toLowerCase() !== pool.poolId.toLowerCase()) {
        throw new Error("Calculated pool ID does not match the Initialize event.");
      }
      checkedPools.push({ ...pool, state, stateCheck: "matched" });
    } catch (error) {
      checkedPools.push({
        ...pool,
        stateCheck: "failed",
        error: error instanceof Error ? error.message : "Pool state check failed.",
      });
    }
  }

  console.log(JSON.stringify({
    chain,
    scan: {
      fromBlock: discovery.fromBlock,
      toBlock: discovery.toBlock,
      scannedBlocks: discovery.scannedBlocks,
      poolsFound: discovery.pools.length,
    },
    pools: checkedPools,
    note: discovery.note,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Pool discovery failed.");
    process.exitCode = 1;
  });
}
