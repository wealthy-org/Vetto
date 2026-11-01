import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSecret, secretMessage } from "./index.ts";

// Wordlist mini hanya untuk menguji logika jendela; tes dengan BIP39 asli ada di apps/web/test.
const WORDS = new Set("alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(" "));
const twelve = [...WORDS].slice(0, 12);

test("private key: 64 hex with or without 0x, in a sentence", () => {
  const k = "ab".repeat(32);
  assert.equal(detectSecret(k), "private-key");
  assert.equal(detectSecret(`0x${k}`), "private-key");
  assert.equal(detectSecret(`my key is 0x${k}, please swap`), "private-key");
  assert.equal(detectSecret("-----BEGIN EC PRIVATE KEY-----\nMHcC"), "private-key");
});

test("private key: addresses and other lengths are not flagged", () => {
  assert.equal(detectSecret(`swap to 0x${"ab".repeat(20)}`), null); // alamat 40 hex
  assert.equal(detectSecret("a".repeat(63)), null);
  assert.equal(detectSecret("a".repeat(65)), null);
  assert.equal(detectSecret("swap 10 USDG to ETH"), null);
});

test("seed phrase: needs an injected wordlist; 12 words, numbered, one typo are caught", () => {
  assert.equal(detectSecret(twelve.join(" ")), null); // tanpa wordlist → tidak bisa menilai
  assert.equal(detectSecret(twelve.join(" "), WORDS), "seed-phrase");
  assert.equal(detectSecret(twelve.map((w, i) => `${i + 1}. ${w}`).join("\n"), WORDS), "seed-phrase");
  assert.equal(detectSecret([...twelve.slice(0, 11), "typoo"].join(" "), WORDS), "seed-phrase");
});

test("seed phrase: ordinary sentences and too-short runs are not flagged", () => {
  assert.equal(detectSecret("please swap about one hundred dollars of my stablecoin into ether tonight", WORDS), null);
  assert.equal(detectSecret(twelve.slice(0, 10).join(" "), WORDS), null);
  assert.equal(detectSecret([...twelve.slice(0, 10), "x", "y"].join(" "), WORDS), null); // hanya 10/12 cocok
});

test("message never repeats the secret and hints at tx hashes only for hex keys", () => {
  assert.doesNotMatch(secretMessage("seed-phrase"), /explorer/);
  assert.match(secretMessage("private-key"), /explorer/);
  assert.match(secretMessage("seed-phrase"), /not processed, repeated, or saved/);
  assert.match(secretMessage("private-key"), /transaction hash/);
});