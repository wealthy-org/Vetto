
import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
} from "viem";

const RPC = process.env.ROBINHOOD_RPC_URL_PRIMARY;
const USDG = process.env.ROBINHOOD_USDG_ADDRESS;
const QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";

if (!RPC || !USDG) {
  throw new Error("RPC_PRIMARY atau USDG_ADDRESS belum tersedia.");
}

const client = createPublicClient({ transport: http(RPC) });

const ABI = [{
  type: "function",
  name: "quoteExactInputSingle",
  stateMutability: "nonpayable",
  inputs: [{
    name: "params",
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" },
        ],
      },
      { name: "zeroForOne", type: "bool" },
      { name: "exactAmount", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  }],
  outputs: [
    { name: "amountOut", type: "uint256" },
    { name: "gasEstimate", type: "uint256" },
  ],
}];

const poolKey = {
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: USDG,
  fee: 500,
  tickSpacing: 10,
  hooks: "0x0000000000000000000000000000000000000000",
};

async function quote(label, zeroForOne, amount, decimals, outDecimals) {
  const [amountOut, gasEstimate] = await client.readContract({
    address: QUOTER,
    abi: ABI,
    functionName: "quoteExactInputSingle",
    args: [{
      poolKey,
      zeroForOne,
      exactAmount: parseUnits(amount, decimals),
      hookData: "0x",
    }],
  });

  return {
    pair: label,
    amountIn: amount,
    amountOut: formatUnits(amountOut, outDecimals),
    gasEstimate: gasEstimate.toString(),
  };
}

async function main() {
  const chainId = await client.getChainId();

  if (chainId !== 4663) {
    throw new Error(`Wrong chain ID: ${chainId}`);
  }

  const results = [];

  results.push(await quote("ETH -> USDG", true, "0.01", 18, 6));
  results.push(await quote("USDG -> ETH", false, "20", 6, 18));

  console.log(JSON.stringify({ chainId, results }, null, 2));
}

main().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
});
