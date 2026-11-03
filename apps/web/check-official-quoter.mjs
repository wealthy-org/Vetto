import { createPublicClient, http } from "viem";

const networks = {
  mainnet: "https://rpc.mainnet.chain.robinhood.com",
  testnet: "https://rpc.testnet.chain.robinhood.com",
};

const address = "0xbf1aB81f7d534b2CC0Da76fcf4d541322bB0e000";

for (const [name, url] of Object.entries(networks)) {
  const client = createPublicClient({ transport: http(url) });

  try {
    const code = await client.getBytecode({ address });
    console.log(`${name}:`, code ? "BYTECODE FOUND" : "NO BYTECODE");
    console.log(`${name} bytes:`, code ? (code.length - 2) / 2 : 0);
  } catch (error) {
    console.log(`${name}: ERROR`, error.shortMessage ?? error.message);
  }
}
