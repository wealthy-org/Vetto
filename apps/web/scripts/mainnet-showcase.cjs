#!/usr/bin/env node

/**
 * Vetto — Robinhood Chain Mainnet CLI Showcase
 * Every value below is read live from mainnet RPC. Nothing is signed or sent.
 * Usage: node scripts/mainnet-showcase.cjs
 */

const https = require("https");

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GRAY = "\x1b[90m";

const RPC_URL = process.env.ROBINHOOD_RPC_URL_PRIMARY || "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER_BASE = "https://robinhoodchain.blockscout.com";
const EXPECTED_CHAIN_ID = 4663;

const VETTO_TOKEN = "0xc0e0daa889ad607416f5c0fa00f92656e7ff455c";
const PROOF_TX = "0xa8a93274c967949d5ded0104e8bc09854b1fd707c3bc8881698de6362eb1a4fc";

// Mainnet contracts Vetto reads for quotes and simulation (see lib/chain-profile.ts).
const CONTRACTS = [
  { name: "Uniswap v4 PoolManager", address: "0x8366a39CC670B4001A1121B8F6A443A643e40951", role: "Pool state for live quotes" },
  { name: "Uniswap v4 Quoter", address: "0x8dc178eFB8111BB0973Dd9d722ebeFF267c98F94", role: "Exact-in / exact-out quote source" },
  { name: "Universal Router", address: "0x8876789976dEcBfCbBbe364623C63652db8C0904", role: "Swap route target used in simulation" },
  { name: "Permit2", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", role: "Token approval checks" },
  { name: "USDG (Global Dollar)", address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", role: "Quote asset on mainnet" },
];

function rpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = https.request(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const j = JSON.parse(body);
          if (j.error) reject(new Error(`${method}: ${j.error.message}`));
          else resolve(j.result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasCode = (code) => typeof code === "string" && code !== "0x";
const codeBytes = (code) => (hasCode(code) ? (code.length - 2) / 2 : 0);

function decodeString(hex) {
  const b = Buffer.from(hex.slice(2), "hex");
  const len = Number(BigInt("0x" + b.subarray(32, 64).toString("hex")));
  return b.subarray(64, 64 + len).toString("utf8");
}

function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = (value / base).toLocaleString("en-US");
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac.slice(0, 6)}` : whole;
}

const call = (to, data) => rpcCall("eth_call", [{ to, data }, "latest"]);

async function run() {
  let checks = 0;
  let passed = 0;
  const check = (ok) => { checks++; if (ok) passed++; return ok; };

  console.clear();
  // Big VETTO wordmark, purple → lilac gradient like the landing page.
  const LOGO = [
    "██╗   ██╗███████╗████████╗████████╗ ██████╗ ",
    "██║   ██║██╔════╝╚══██╔══╝╚══██╔══╝██╔═══██╗",
    "██║   ██║█████╗     ██║      ██║   ██║   ██║",
    "╚██╗ ██╔╝██╔══╝     ██║      ██║   ██║   ██║",
    " ╚████╔╝ ███████╗   ██║      ██║   ╚██████╔╝",
    "  ╚═══╝  ╚══════╝   ╚═╝      ╚═╝    ╚═════╝ ",
  ];
  const from = [124, 92, 255], to = [214, 180, 255];
  console.log("");
  LOGO.forEach((line, i) => {
    const t = i / (LOGO.length - 1);
    const [r, g, b] = from.map((v, k) => Math.round(v + (to[k] - v) * t));
    console.log(`  ${BOLD}\x1b[38;2;${r};${g};${b}m${line}${RESET}`);
  });
  console.log(`  \x1b[38;2;180;160;230mRobinhood Chain Mainnet Showcase · live, read-only${RESET}\n`);

  process.stdout.write(`${GRAY}[*] Connecting to Robinhood Chain Mainnet RPC... ${RESET}`);
  const [chainIdHex, blockHex, gasPriceHex] = await Promise.all([
    rpcCall("eth_chainId"), rpcCall("eth_blockNumber"), rpcCall("eth_gasPrice"),
  ]);
  const chainId = parseInt(chainIdHex, 16);
  const chainOk = check(chainId === EXPECTED_CHAIN_ID);
  console.log(chainOk ? `${GREEN}CONNECTED${RESET}` : `${RED}WRONG CHAIN (${chainId})${RESET}`);

  console.log(`\n${BOLD}--- 1. NETWORK TELEMETRY (LIVE) ---${RESET}`);
  console.log(`  ${BOLD}Network Name:${RESET}      Robinhood Chain (Arbitrum Orbit L2)`);
  console.log(`  ${BOLD}Chain ID:${RESET}          ${chainOk ? GREEN : RED}${chainId}${RESET} (0x${chainId.toString(16)})`);
  console.log(`  ${BOLD}Latest Block:${RESET}      #${parseInt(blockHex, 16)}`);
  console.log(`  ${BOLD}Gas Price:${RESET}         ${(parseInt(gasPriceHex, 16) / 1e9).toFixed(4)} Gwei`);
  console.log(`  ${BOLD}Mainnet RPC:${RESET}       ${RPC_URL}`);
  console.log(`  ${BOLD}Mainnet Explorer:${RESET}  ${EXPLORER_BASE}`);

  console.log(`\n${BOLD}--- 2. $VETTO TOKEN ---${RESET}`);
  const tokenCode = await rpcCall("eth_getCode", [VETTO_TOKEN, "latest"]);
  if (check(hasCode(tokenCode))) {
    const [name, symbol, decimalsHex, supplyHex] = await Promise.all([
      call(VETTO_TOKEN, "0x06fdde03"), call(VETTO_TOKEN, "0x95d89b41"),
      call(VETTO_TOKEN, "0x313ce567"), call(VETTO_TOKEN, "0x18160ddd"),
    ]);
    const decimals = parseInt(decimalsHex, 16);
    console.log(`  ${BOLD}Status:${RESET}            ${GREEN}LIVE — BYTECODE PRESENT${RESET}`);
    console.log(`  ${BOLD}Contract Address:${RESET}  ${YELLOW}${VETTO_TOKEN}${RESET}`);
    console.log(`  ${BOLD}Name / Symbol:${RESET}     ${decodeString(name)} / ${decodeString(symbol)}`);
    console.log(`  ${BOLD}Decimals:${RESET}          ${decimals}`);
    console.log(`  ${BOLD}Total Supply:${RESET}      ${formatUnits(BigInt(supplyHex), decimals)}`);
    console.log(`  ${BOLD}Bytecode:${RESET}          ${codeBytes(tokenCode)} bytes`);
    console.log(`  ${BOLD}Explorer URL:${RESET}      ${EXPLORER_BASE}/token/${VETTO_TOKEN}`);
  } else {
    console.log(`  ${RED}NOT FOUND — no bytecode at ${VETTO_TOKEN}${RESET}`);
  }

  console.log(`\n${BOLD}--- 3. MAINNET CONTRACTS VETTO READS ---${RESET}`);
  console.log(`${GRAY}Checking live bytecode for each address...${RESET}\n`);
  for (let i = 0; i < CONTRACTS.length; i++) {
    const c = CONTRACTS[i];
    process.stdout.write(`  [${i + 1}/${CONTRACTS.length}] ${BOLD}${c.name.padEnd(24)}${RESET} `);
    const code = await rpcCall("eth_getCode", [c.address, "latest"]);
    if (check(hasCode(code))) {
      console.log(`${GREEN}LIVE${RESET}`);
      console.log(`      ${GRAY}Address:${RESET}      ${CYAN}${c.address}${RESET}`);
      console.log(`      ${GRAY}Bytecode:${RESET}     ${codeBytes(code)} bytes`);
      console.log(`      ${GRAY}Explorer URL:${RESET} ${EXPLORER_BASE}/address/${c.address}`);
      console.log(`      ${GRAY}Role:${RESET}         ${c.role}\n`);
    } else {
      console.log(`${RED}NOT FOUND${RESET}\n`);
    }
    await sleep(80);
  }

  console.log(`${BOLD}--- 4. MAINNET TRANSACTION PROOF ---${RESET}`);
  const [tx, rcpt] = await Promise.all([
    rpcCall("eth_getTransactionByHash", [PROOF_TX]),
    rpcCall("eth_getTransactionReceipt", [PROOF_TX]),
  ]);
  if (check(Boolean(tx && rcpt && rcpt.status === "0x1"))) {
    const block = await rpcCall("eth_getBlockByNumber", [rcpt.blockNumber, false]);
    console.log(`  ${BOLD}Status:${RESET}            ${GREEN}SUCCESS${RESET}`);
    console.log(`  ${BOLD}TX Hash:${RESET}           ${PROOF_TX}`);
    console.log(`  ${BOLD}Block:${RESET}             #${parseInt(rcpt.blockNumber, 16)}`);
    console.log(`  ${BOLD}Timestamp:${RESET}         ${new Date(parseInt(block.timestamp, 16) * 1000).toISOString()}`);
    console.log(`  ${BOLD}From:${RESET}              ${tx.from}`);
    console.log(`  ${BOLD}To:${RESET}                ${tx.to ?? "Contract creation"}`);
    console.log(`  ${BOLD}Value:${RESET}             ${formatUnits(BigInt(tx.value), 18)} ETH`);
    console.log(`  ${BOLD}Gas Used:${RESET}          ${parseInt(rcpt.gasUsed, 16)}`);
    console.log(`  ${BOLD}TX Explorer:${RESET}       ${EXPLORER_BASE}/tx/${PROOF_TX}`);
  } else {
    console.log(`  ${RED}${rcpt ? "TX FAILED (status " + rcpt.status + ")" : "TX NOT FOUND"}${RESET}`);
  }

  console.log(`\n${GRAY}Read-only: no signing, no transaction submission.${RESET}\n`);
  if (passed !== checks) process.exitCode = 1;
}

run().catch((err) => {
  console.error(`${RED}CLI error:${RESET}`, err.message || err);
  process.exitCode = 1;
});
