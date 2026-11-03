import { createPublicClient, http, parseAbi } from "viem";

const networks = {
  mainnet: "https://rpc.mainnet.chain.robinhood.com",
  testnet: "https://rpc.testnet.chain.robinhood.com",
};

const router = "0x8876789976dEcBfCbBbe364623C63652db8C0904";
const positionManager = "0x58daec3116aae6d93017baaea7749052e8a04fa7";

const routerAbi = parseAbi([
  "function V4_POOL_MANAGER() view returns (address)",
  "function V4_POSITION_MANAGER() view returns (address)",
  "function V4_QUOTER() view returns (address)",
  "function PERMIT2() view returns (address)"
]);

const positionAbi = parseAbi([
  "function poolManager() view returns (address)"
]);

for (const [network, url] of Object.entries(networks)) {
  const client = createPublicClient({ transport: http(url) });
  console.log(`\n===== ${network.toUpperCase()} =====`);

  for (const [name, address, abi, functions] of [
    ["UniversalRouter", router, routerAbi,
      ["V4_POOL_MANAGER", "V4_POSITION_MANAGER", "V4_QUOTER", "PERMIT2"]],
    ["PositionManager", positionManager, positionAbi, ["poolManager"]]
  ]) {
    for (const fn of functions) {
      try {
        const result = await client.readContract({
          address,
          abi,
          functionName: fn
        });
        console.log(`${name}.${fn}: ${result}`);
      } catch (error) {
        console.log(`${name}.${fn}: UNAVAILABLE - ${error.shortMessage ?? error.message}`);
      }
    }
  }
}
