import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http("https://rpc.testnet.chain.robinhood.com"),
});

const hash = "0xd1220c134ee760525b6a91732ccb3cfeae636288067c7d4c5c245e4dec73546b";

const [tx, receipt] = await Promise.all([
  client.getTransaction({ hash }),
  client.getTransactionReceipt({ hash }),
]);

console.log("\n===== ROUTER CALLDATA =====");
console.log(tx.input);

console.log("\n===== RECEIPT LOGS =====");
for (const [i, log] of receipt.logs.entries()) {
  console.log(`\nLog ${i + 1}`);
  console.log("Address:", log.address);
  console.log("Topics:", log.topics);
  console.log("Data:", log.data);
}
