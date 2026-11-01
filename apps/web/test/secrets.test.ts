import { test } from "node:test";
import assert from "node:assert/strict";
import { english, generateMnemonic } from "viem/accounts";
import { findSecret } from "../lib/secret-guard.ts";
import { POST as intent } from "../app/api/intent/route.ts";
import { POST as saveHistory } from "../app/api/history/route.ts";

const BASE = "http://localhost:3000";
let n = 0;
const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": `10.9.${Math.floor(++n / 250)}.${n % 250}`, ...extra },
    body: JSON.stringify(body),
  });

const HARDHAT = "test test test test test test test test test test test junk";
const PRIVATE_KEY = `0x${"ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"}`;

test("real BIP39: 12 and 24 generated phrases are always detected (100 samples each)", () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(findSecret(generateMnemonic(english, 128)), "seed-phrase");
    assert.equal(findSecret(generateMnemonic(english, 256)), "seed-phrase");
  }
});

test("real BIP39: wrapped in a sentence, numbered, comma-separated, or with one typo", () => {
  const words = generateMnemonic(english, 128).split(" ");
  assert.equal(findSecret(`my wallet seed is ${words.join(" ")} please help`), "seed-phrase");
  assert.equal(findSecret(words.map((w, i) => `${i + 1}. ${w}`).join("\n")), "seed-phrase");
  assert.equal(findSecret(words.join(", ")), "seed-phrase");
  assert.equal(findSecret([...words.slice(0, 11), "zzzzz"].join(" ")), "seed-phrase");
  assert.equal(findSecret(HARDHAT), "seed-phrase");
});

test("false positives: ordinary requests and sentences pass", () => {
  const ok = [
    "swap 10 USDG to ETH", "Swap 10,000 usdg to eth privately with 1% slippage", "Is claim-hood-rewards.xyz safe?",
    "Mint the NFT at nft-mint-pass.app max 0.01 ETH", "open it live", "https://demo-dex.app/swap",
    "please swap about one hundred dollars of my stablecoin into ether tonight when the market looks calm",
    "can you explain how the route comparison works and why only one route is shown right now for my trade",
    "I want to check whether this website is safe before I connect my wallet and sign anything at all",
    `swap to 0x${"ab".repeat(20)}`, // alamat kontrak (40 hex) bukan private key
  ];
  for (const t of ok) assert.equal(findSecret(t), null, t);
});

test("/api/intent rejects secrets with 422 + SECRET_DETECTED and never echoes them", async () => {
  for (const text of [HARDHAT, `use ${PRIVATE_KEY} to swap 1 ETH to USDG`]) {
    const r = await intent(post("/api/intent", { text }));
    assert.equal(r.status, 422);
    const raw = await r.text();
    const b = JSON.parse(raw);
    assert.equal(b.code, "SECRET_DETECTED");
    assert.ok(!raw.includes("junk") && !raw.includes(PRIVATE_KEY.slice(2, 20)), "response must not echo the secret");
  }
  assert.equal((await intent(post("/api/intent", { text: "swap 10 USDG to ETH" }))).status, 200);
});

test("/api/history refuses to store secrets (422) before touching auth or the database", async () => {
  const r = await saveHistory(post("/api/history", { prompt: HARDHAT }));
  assert.equal(r.status, 422);
  assert.equal((await r.json()).code, "SECRET_DETECTED");
  // prompt normal tanpa Idempotency-Key tetap ditolak oleh aturan lama (400), bukan oleh detektor
  assert.equal((await saveHistory(post("/api/history", { prompt: "swap 10 USDG to ETH" }))).status, 400);
});