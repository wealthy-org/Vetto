import {
  createPublicClient,
  formatEther,
  http,
} from "viem";

const DEFAULT_TX =
  "0xa8a93274c967949d5ded0104e8bc09854b1fd707c3bc8881698de6362eb1a4fc";

const EXPLORER = "https://robinhoodchain.blockscout.com";
const RPC =
  process.env.ROBINHOOD_RPC_URL_PRIMARY ||
  "https://rpc.mainnet.chain.robinhood.com";

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const hash = getArg("--tx") || DEFAULT_TX;
const jsonMode = args.includes("--json");
const ansi = args.includes("--ansi");

if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
  throw new Error("Hash transaksi tidak valid.");
}

const color = (code, value) =>
  ansi ? `\u001b[${code}m${value}\u001b[0m` : value;

const client = createPublicClient({
  transport: http(RPC, { timeout: 20_000 }),
});

const chainId = await client.getChainId();

if (chainId !== 4663) {
  throw new Error(`Wrong chain: ${chainId}. Expected Robinhood Chain 4663.`);
}

const [tx, receipt, latestBlock, gasPrice] = await Promise.all([
  client.getTransaction({ hash }),
  client.getTransactionReceipt({ hash }),
  client.getBlockNumber(),
  client.getGasPrice(),
]);

const block = await client.getBlock({
  blockNumber: receipt.blockNumber,
});

const targetCode = tx.to
  ? await client.getBytecode({ address: tx.to })
  : undefined;

const result = {
  network: {
    name: "Robinhood Chain",
    chainId,
    rpc: RPC,
    latestBlock: latestBlock.toString(),
  },
  transaction: {
    hash,
    explorer: `${EXPLORER}/tx/${hash}`,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    from: tx.from,
    to: tx.to,
    valueWei: tx.value.toString(),
    valueEth: formatEther(tx.value),
    nonce: tx.nonce,
    transactionIndex: receipt.transactionIndex,
    gas: {
      limit: tx.gas.toString(),
      used: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null,
      currentNetworkGasPrice: gasPrice.toString(),
    },
    inputBytes: Math.max(0, (tx.input.length - 2) / 2),
    targetRuntimeBytecodeBytes: targetCode
      ? (targetCode.length - 2) / 2
      : 0,
  },
  verification: {
    chainIdMatches: chainId === 4663,
    receiptFound: true,
    transactionFound: true,
    confirmed: receipt.status === "success",
    targetHasBytecode: Boolean(targetCode && targetCode !== "0x"),
  },
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log("");
  console.log(color("36;1", "VETTO / MAINNET TRANSACTION PROOF"));
  console.log("======================================");
  console.log(`Network       : Robinhood Chain`);
  console.log(`Chain ID      : ${chainId}`);
  console.log(`Latest block  : ${latestBlock}`);
  console.log("");
  console.log(color("36;1", "TRANSACTION"));
  console.log(`Hash          : ${hash}`);
  console.log(`Status        : ${receipt.status}`);
  console.log(`Block         : ${receipt.blockNumber}`);
  console.log(`Timestamp     : ${result.transaction.timestamp}`);
  console.log(`From          : ${tx.from}`);
  console.log(`To            : ${tx.to ?? "Contract creation"}`);
  console.log(`Value         : ${formatEther(tx.value)} ETH`);
  console.log("");
  console.log(color("36;1", "EXECUTION"));
  console.log(`Gas limit     : ${tx.gas}`);
  console.log(`Gas used      : ${receipt.gasUsed}`);
  console.log(`Gas price     : ${receipt.effectiveGasPrice ?? "N/A"} wei`);
  console.log(`Input         : ${result.transaction.inputBytes} bytes`);
  console.log(`Target code   : ${result.transaction.targetRuntimeBytecodeBytes} bytes`);
  console.log("");
  console.log(color("36;1", "VERIFICATION"));
  console.log(`Chain         : ${result.verification.chainIdMatches ? "PASS" : "FAIL"}`);
  console.log(`Transaction   : PASS`);
  console.log(`Receipt       : PASS`);
  console.log(`Execution     : ${receipt.status === "success" ? color("32;1", "SUCCESS") : color("31;1", "FAILED")}`);
  console.log("");
  console.log(`Explorer      : ${result.transaction.explorer}`);
  console.log("");
  console.log("READ ONLY — no signing or transaction submission.");
}

if (receipt.status !== "success") {
  process.exitCode = 1;
}
