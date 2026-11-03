import { createPublicClient, http } from "viem";

const client = createPublicClient({
  transport: http("https://rpc.testnet.chain.robinhood.com", {
    timeout: 20000,
  }),
});

const hash = "0xd1220c134ee760525b6a91732ccb3cfeae636288067c7d4c5c245e4dec73546b";

try {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);

  console.log("\n===== TESTNET SWAP TRANSACTION =====");
  console.log("Hash:", hash);
  console.log("From:", tx.from);
  console.log("To:", tx.to);
  console.log("Input selector:", tx.input.slice(0, 10));
  console.log("Block:", receipt.blockNumber.toString());
  console.log("Status:", receipt.status);
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Logs:", receipt.logs.length);
  console.log(
    "Explorer:",
    `https://explorer.testnet.chain.robinhood.com/tx/${hash}`
  );
} catch (error) {
  console.log("ERROR:", error.shortMessage ?? error.message);
}
