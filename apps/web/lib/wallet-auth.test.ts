import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyMessage } from "viem";
import {
  hashSessionToken,
  makeSiweMessage,
  normalizeSignature,
  normalizeWalletAddress,
} from "./wallet-auth.ts";

test("wallet auth normalizes EVM addresses and accepts only 65-byte signatures", () => {
  assert.equal(normalizeWalletAddress("0x0000000000000000000000000000000000000001"), "0x0000000000000000000000000000000000000001");
  assert.equal(normalizeWalletAddress("not-an-address"), null);
  assert.equal(normalizeSignature(`0x${"a".repeat(130)}`), `0x${"a".repeat(130)}`);
  assert.equal(normalizeSignature("0x1234"), null);
});

test("SIWE message is domain-bound, chain-bound, and explicitly not transaction approval", () => {
  const message = makeSiweMessage({
    domain: "vetto.example",
    uri: "https://vetto.example",
    address: "0x0000000000000000000000000000000000000001",
    nonce: "a1b2c3d4e5f6a7b8",
    issuedAt: new Date("2026-11-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:05:00.000Z"),
  });
  assert.match(message, /^vetto\.example wants you to sign in with your Ethereum account:/);
  assert.match(message, /Sign in to VETTO\. This does not authorize token transfers or any transaction\./);
  assert.match(message, /Chain ID: 1/);
  assert.match(message, /Nonce: a1b2c3d4e5f6a7b8/);
  assert.match(message, /Expiration Time: 2026-11-01T00:05:00\.000Z/);
});

test("session token storage uses a one-way hash", () => {
  const first = hashSessionToken("opaque-session-token");
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(hashSessionToken("different-session-token"), first);
});

test("wallet signature verifies only for the exact SIWE message", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = makeSiweMessage({
    domain: "vetto.example",
    uri: "https://vetto.example",
    address: account.address,
    nonce: "a1b2c3d4e5f6a7b8",
    issuedAt: new Date("2026-11-01T00:00:00.000Z"),
    expiresAt: new Date("2026-11-01T00:05:00.000Z"),
  });
  const signature = await account.signMessage({ message });
  assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
  assert.equal(await verifyMessage({ address: account.address, message: `${message}\n`, signature }), false);
});
