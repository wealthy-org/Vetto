import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WALLET_OPTIONS,
  detectedWallets,
  isMobileBrowser,
  phantomBrowseUrl,
} from "./injected-wallet.ts";

test("Phantom is a first-class option, not something the WalletConnect list has to supply", () => {
  const phantom = WALLET_OPTIONS.find((wallet) => wallet.id === "phantom");

  assert.ok(phantom, "Phantom must stay in the picker");
  assert.equal(phantom?.kind, "injected");
  // WalletConnect is offered as a separate row; it is not how Phantom is reached.
  assert.equal(WALLET_OPTIONS.filter((wallet) => wallet.id === "walletconnect").length, 1);
  assert.deepEqual(
    WALLET_OPTIONS.map((wallet) => wallet.id),
    ["phantom", "metamask", "rabby", "coinbase", "walletconnect"],
  );
});

test("without a browser there is nothing to detect and no deeplink", () => {
  // walletconnect is always offered (it does not depend on anything injected).
  assert.deepEqual(detectedWallets(), {
    phantom: false,
    metamask: false,
    rabby: false,
    coinbase: false,
    walletconnect: true,
  });
  assert.equal(phantomBrowseUrl(), null);
  assert.equal(isMobileBrowser(), false);
});
