import { createPublicClient, http, keccak256 } from "viem";

const networks = {
  mainnet: "https://rpc.mainnet.chain.robinhood.com",
  testnet: "https://rpc.testnet.chain.robinhood.com",
};

const addresses = {
  PositionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
  UniversalRouter: "0x8876789976dEcBfCbBbe364623C63652db8C0904",
  PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
};

for (const [network, url] of Object.entries(networks)) {
  const client = createPublicClient({ transport: http(url) });
  console.log(`\n${network.toUpperCase()}`);

  for (const [name, address] of Object.entries(addresses)) {
    try {
      const code = await client.getBytecode({ address });
      console.log(`${name}:`, code ? keccak256(code) : "NO BYTECODE");
    } catch (error) {
      console.log(`${name}: ERROR`, error.shortMessage ?? error.message);
    }
  }
}

