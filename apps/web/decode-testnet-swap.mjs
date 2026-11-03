import {
  createPublicClient,
  http,
  decodeFunctionData,
  parseAbi,
} from "viem";

const client = createPublicClient({
  transport: http("https://rpc.testnet.chain.robinhood.com"),
});

const hash = "0xd1220c134ee760525b6a91732ccb3cfeae636288067c7d4c5c245e4dec73546b";
const token = "0xc446fce1650ccdd4ff006456f04e9476f8c516f3";
const hook = "0x2779651fee12f6fb5a187578de6b63709f85d0cc";

const abi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const [tx, tokenCode, hookCode] = await Promise.all([
  client.getTransaction({ hash }),
  client.getCode({ address: token }),
  client.getCode({ address: hook }),
]);

const decoded = decodeFunctionData({
  abi,
  data: tx.input,
});

console.log("\n===== DECODED ROUTER =====");
console.log("ETH value:", tx.value.toString());
console.log("Commands:", decoded.args[0]);
console.log("Inputs:", decoded.args[1]);
console.log("Deadline:", decoded.args[2].toString());

console.log("\n===== OUTPUT TOKEN =====");
console.log("Address:", token);
console.log("Bytecode exists:", !!tokenCode);
try {
  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address: token, abi, functionName: "symbol" }),
    client.readContract({ address: token, abi, functionName: "name" }),
    client.readContract({ address: token, abi, functionName: "decimals" }),
  ]);
  console.log({ symbol, name, decimals });
} catch (e) {
  console.log("Metadata read failed:", e.shortMessage ?? e.message);
}

console.log("\n===== HOOK =====");
console.log("Address:", hook);
console.log("Bytecode exists:", !!hookCode);
