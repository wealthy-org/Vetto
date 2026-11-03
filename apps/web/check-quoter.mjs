import { createPublicClient, http, parseAbi } from "viem";

const networks = {
  mainnet: "https://rpc.mainnet.chain.robinhood.com",
  testnet: "https://rpc.testnet.chain.robinhood.com",
};

const quoter = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94";

const abi = parseAbi([
  "function poolManager() view returns (address)"
]);

for (const [name, url] of Object.entries(networks)) {
  const client = createPublicClient({ transport: http(url) });

  try {
    const result = await client.readContract({
      address: quoter,
      abi,
      functionName: "poolManager",
    });

    console.log(`${name}: Quoter PoolManager = ${result}`);
  } catch (error) {
    console.log(`${name}: UNAVAILABLE - ${error.shortMessage ?? error.message}`);
  }
}
