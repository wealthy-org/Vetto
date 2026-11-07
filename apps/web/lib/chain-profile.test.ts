import assert from "node:assert/strict";
import { test } from "node:test";

/** A minimal stand-in for process.env: the profile code only reads strings. */
const env = (values: Record<string, string> = {}) => values as unknown as NodeJS.ProcessEnv;

import {
  MAINNET_PROFILE,
  PROFILES,
  TESTNET_PROFILE,
  activeProfile,
  profileMismatch,
  publicProfileKey,
  serverProfile,
} from "./chain-profile.ts";
import { POOL_VENUES, ROBINHOOD_CHAIN_ID, USDG, rpcUrls, rpcUrlsFor } from "./robinhood-chain.ts";

test("mainnet RPC overrides never leak into a testnet deployment", () => {
  // Exactly what a real .env.local looks like when someone flips the profile.
  const mainnetish = env({
    ROBINHOOD_RPC_URL_PRIMARY: "https://rpc.mainnet.chain.robinhood.com",
    ROBINHOOD_RPC_URL_SECONDARY: "https://robinhood.drpc.org",
  });

  const testnet = rpcUrlsFor(TESTNET_PROFILE, mainnetish);
  assert.equal(testnet.primary, "https://rpc.testnet.chain.robinhood.com");
  assert.equal(testnet.secondary, null);

  assert.equal(rpcUrlsFor(MAINNET_PROFILE, mainnetish).primary, "https://rpc.mainnet.chain.robinhood.com");
  assert.equal(rpcUrlsFor(MAINNET_PROFILE, env()).primary, rpcUrls(env()).primary);

  // A testnet deployment that wants a private endpoint uses its own variable.
  assert.equal(
    rpcUrlsFor(TESTNET_PROFILE, env({ ROBINHOOD_TESTNET_RPC_URL_PRIMARY: "https://tn.example" })).primary,
    "https://tn.example",
  );
});

test("mainnet is the default profile", () => {
  assert.equal(serverProfile(env({})).key, "mainnet");
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: "" })).key, "mainnet");
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: "MAINNET" })).key, "mainnet");
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: "prod" })).key, "mainnet");
});

test("testnet is opt-in and never the fallback", () => {
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: "testnet" })).key, "testnet");
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: " testnet " })).key, "testnet");
  assert.equal(serverProfile(env({ VETTO_CHAIN_PROFILE: "testnets" })).key, "mainnet");
});

test("the running deployment keeps its mainnet bindings", () => {
  assert.equal(ROBINHOOD_CHAIN_ID, MAINNET_PROFILE.chainId);
  assert.equal(USDG.symbol, "USDG");
  assert.deepEqual(
    POOL_VENUES.map((venue) => venue.id),
    ["rh-v4-eth-usdg-500", "rh-v4-eth-usdg-3000", "rh-v4-eth-usdg-10000"],
  );
});

test("testnet profile carries its own chain, router and pools", () => {
  assert.equal(TESTNET_PROFILE.chainId, 46630);
  assert.equal(TESTNET_PROFILE.isTestnet, true);
  assert.notEqual(TESTNET_PROFILE.contracts.v4Quoter, MAINNET_PROFILE.contracts.v4Quoter);
  assert.notEqual(
    TESTNET_PROFILE.contracts.universalRouter,
    MAINNET_PROFILE.contracts.universalRouter,
  );
  assert.equal(TESTNET_PROFILE.contracts.poolManager, MAINNET_PROFILE.contracts.poolManager);
  assert.equal(TESTNET_PROFILE.venues.length, 2);
  assert.deepEqual(TESTNET_PROFILE.assets.map((asset) => asset.symbol), ["ETH", "HUNT", "DUCKCOIN"]);
  for (const venue of TESTNET_PROFILE.venues) {
    assert.notEqual(venue.poolKey.currency1, MAINNET_PROFILE.quoteAsset.address);
    // A pool with hooks is only reachable if the hooks address is part of the key.
    assert.notEqual(venue.poolKey.hooks, "0x0000000000000000000000000000000000000000");
  }
  assert.ok(TESTNET_PROFILE.assets.every((asset) => asset.testOnly !== false));
});

test("a build that disagrees with its server is reported, not silently fixed", () => {
  assert.equal(profileMismatch(env()), false);
  assert.equal(
    profileMismatch(env({ VETTO_CHAIN_PROFILE: "testnet", NEXT_PUBLIC_VETTO_CHAIN_PROFILE: "testnet" })),
    false,
  );
  assert.equal(
    profileMismatch(env({ VETTO_CHAIN_PROFILE: "testnet", NEXT_PUBLIC_VETTO_CHAIN_PROFILE: "" })),
    true,
  );
  // The client key is read from the inlined NEXT_PUBLIC_* value, defaulting to mainnet.
  assert.equal(publicProfileKey(), "mainnet");
  assert.deepEqual(Object.keys(PROFILES).sort(), ["mainnet", "testnet"]);
  assert.equal(activeProfile(env()).key, "mainnet");
});
