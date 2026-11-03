import {
  createPublicClient,
  http,
  parseAbiItem,
  parseAbi,
  toHex,
  hexToBigInt,
} from "viem";

const rpc = "https://rpc.testnet.chain.robinhood.com";
const client = createPublicClient({ transport: http(rpc, { timeout: 20000 }) });

const poolManager = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const router = "0x8876789976dEcBfCbBbe364623C63652db8C0904";

const swapEvent = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
);

try {
  const latest = await client.getBlockNumber();
  const fromBlock = latest > 5000n ? latest - 5000n : 0n;

  console.log("Latest block:", latest.toString());
  console.log("Scanning from:", fromBlock.toString());
  console.log("PoolManager:", poolManager);
  console.log("Router:", router);

  const logs = await client.getLogs({
    address: poolManager,
    event: swapEvent,
    args: { sender: router },
    fromBlock,
    toBlock: latest,
  });

  console.log("\n===== ROUTER SWAP EVENTS =====");
  console.log("Events found:", logs.length);

  for (const log of logs.slice(0, 10)) {
    console.log({
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber?.toString(),
      poolId: log.args.id,
      amount0: log.args.amount0?.toString(),
      amount1: log.args.amount1?.toString(),
    });
  }
} catch (error) {
  console.log("RPC CHECK ERROR:", error.shortMessage ?? error.message);
}
