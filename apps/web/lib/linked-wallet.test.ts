import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WALLET_NOT_LINKED_ON_THIS_CHAIN,
  pickLinkedWallet,
  walletLinkMessage,
} from "./linked-wallet.ts";

const ADDRESS = "0x1a5e58ec9b1e1b1c9b1e58ec9b1e1b1c9b1e58ec";

test("a wallet linked on this chain is returned as-is", () => {
  const lookup = pickLinkedWallet([{ address: ADDRESS, chain_id: "4663" }], 4663);

  assert.deepEqual(lookup.wallet, { address: ADDRESS, chainId: 4663 });
  assert.deepEqual(lookup.otherChainIds, []);
});

test("a session created on the other chain is explained, not 404'd", () => {
  // Exactly the observed case: signed in while the deployment was on testnet,
  // then the deployment moved to mainnet.
  const lookup = pickLinkedWallet([{ address: ADDRESS, chain_id: "46630" }], 4663);

  assert.equal(lookup.wallet, undefined);
  assert.deepEqual(lookup.otherChainIds, [46630]);

  const message = walletLinkMessage(lookup, "Robinhood Chain · 4663", 4663);
  assert.match(message, /linked on chain 46630/);
  assert.match(message, /Sign out and sign in again/);
  assert.match(message, /Nothing was sent/);
  // No addresses, no driver internals.
  assert.ok(!message.includes(ADDRESS));
  assert.ok(!message.toLowerCase().includes("select"));
});

test("a wallet linked on both chains uses the current one", () => {
  const lookup = pickLinkedWallet(
    [
      { address: ADDRESS, chain_id: "46630" },
      { address: ADDRESS, chain_id: "4663" },
    ],
    4663,
  );

  assert.equal(lookup.wallet?.chainId, 4663);
  assert.deepEqual(lookup.otherChainIds, []);
});

test("no linked wallet at all still tells the person what to do", () => {
  const lookup = pickLinkedWallet([], 4663);
  const message = walletLinkMessage(lookup, "Robinhood Chain · 4663", 4663);

  assert.deepEqual(lookup.otherChainIds, []);
  assert.match(message, /No wallet is linked/);
  assert.match(message, /Sign in again/);
  assert.equal(WALLET_NOT_LINKED_ON_THIS_CHAIN, "WALLET_NOT_LINKED_ON_THIS_CHAIN");
});
