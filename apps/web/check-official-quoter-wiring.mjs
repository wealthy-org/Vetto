import { createPublicClient, http, parseAbi } from "viem";

const networks = {
  mainnet: "https://rpc.mainnet.chain.robinhood.com",
  testnet: "https://rpc.testnet.chain.robinhood.com",
};

const address = "0xbf1aB81f7d534b2CC0Da76fcf4d541322bB0e000";

const abi = parseAbi([
  "function poolManager() view returns (address)"
]);

for (const [name, url] of Object.entries(networks)) {
  const client = createPublicClient({ transport: http(url) });

  try {
    const manager = await client.readContract({
      address,
      abi,
      functionName: "poolManager",
    });

    console.log(`${name}: Quoter PoolManager = ${manager}`);
  } catch (error) {
    console.log(`${name}: ERROR - ${error.shortMessage ?? error.message}`);
  }
}
