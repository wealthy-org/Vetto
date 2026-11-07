import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The execute path must never be the reason a valid wallet looks wrong.
 *
 * Both failures reported from the browser are covered here:
 *  - "Please connect using Robinhood Chain Testnet · 46630" thrown while the wallet
 *    was fine (the chain was read from a cached provider property),
 *  - the WalletConnect modal opening on execute even though MetaMask had signed in.
 */

const CHAIN_HEX = "0xb63e"; // 46654? — replaced below with the real profile chain
const targetChainHex = `0x${(4663).toString(16)}`;

interface FakeProviderOptions {
  accounts?: string[];
  chainId?: string | number | undefined;
  switchFails?: number;
  addSucceeds?: boolean;
}

function fakeProvider(options: FakeProviderOptions = {}) {
  const calls: { method: string; params?: unknown }[] = [];
  let chainId = options.chainId ?? targetChainHex;
  const accounts = options.accounts ?? ["0x0000000000000000000000000000000000000001"];

  const provider = {
    calls,
    request: async <T = unknown>({ method, params }: { method: string; params?: unknown }): Promise<T> => {
      calls.push({ method, params });

      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return accounts as unknown as T;
        case "eth_chainId":
          return chainId as unknown as T;
        case "wallet_switchEthereumChain":
          if (options.switchFails !== undefined) {
            const error = Object.assign(new Error("nope"), { code: options.switchFails });
            throw error;
          }
          chainId = (params as { chainId: string }[])[0]!.chainId;
          return null as unknown as T;
        case "wallet_addEthereumChain":
          if (options.addSucceeds === false) throw new Error("refused");
          chainId = (params as { chainId: string }[])[0]!.chainId;
          return null as unknown as T;
        default:
          return null as unknown as T;
      }
    },
  };

  return provider;
}

test("readChainId asks the wallet instead of trusting a cached property", async () => {
  const { readChainId } = await import("./injected-wallet.ts");

  // Hex string, decimal number, garbage and a throwing wallet.
  assert.equal(await readChainId(fakeProvider({ chainId: targetChainHex }) as never), 4663);
  assert.equal(await readChainId(fakeProvider({ chainId: 4663 }) as never), 4663);
  assert.equal(await readChainId(fakeProvider({ chainId: "nonsense" }) as never), null);
  assert.equal(
    await readChainId({
      request: async () => {
        throw new Error("no wallet");
      },
    } as never),
    null,
  );
  assert.notEqual(CHAIN_HEX, targetChainHex);
});

test("ensureRobinhoodChain switches a wallet that is on another chain", async () => {
  const { ensureRobinhoodChain } = await import("./injected-wallet.ts");

  const provider = fakeProvider({ chainId: "0x1" });
  await ensureRobinhoodChain(provider as never);

  assert.ok(provider.calls.some((call) => call.method === "wallet_switchEthereumChain"));
  assert.equal(await provider.request({ method: "eth_chainId" }), targetChainHex);
});

test("a wallet that does not know the chain gets it added", async () => {
  const { ensureRobinhoodChain } = await import("./injected-wallet.ts");

  const provider = fakeProvider({ chainId: "0x1", switchFails: 4902 });
  await ensureRobinhoodChain(provider as never);

  assert.ok(provider.calls.some((call) => call.method === "wallet_addEthereumChain"));
});

test("a refused switch says what to do and confirms nothing was sent", async () => {
  const { ensureRobinhoodChain } = await import("./injected-wallet.ts");

  const provider = fakeProvider({ chainId: "0x1", switchFails: 4001 });
  await assert.rejects(
    () => ensureRobinhoodChain(provider as never),
    (error: Error) =>
      /Switch the network in your wallet/.test(error.message) && /Nothing was sent/.test(error.message),
  );
});

test("an injected wallet holding the address wins over WalletConnect", async () => {
  const address = "0x00000000000000000000000000000000000000aa";
  const injected = fakeProvider({ accounts: [address] });

  // A browser where MetaMask is one of several injected providers (EIP-5749 list).
  Object.assign(injected, { isMetaMask: true, providers: [injected] });

  (globalThis as Record<string, unknown>).window = {
    phantom: { ethereum: fakeProvider({ accounts: [] }) },
    ethereum: injected,
  };

  try {
    const { authorizedInjectedWallet, resolveSendProvider } = await import("./execute-provider.ts");

    const found = await authorizedInjectedWallet(address);
    assert.equal(found?.wallet, "metamask");

    const resolved = await resolveSendProvider(address);
    assert.equal(resolved.via, "metamask");
    assert.equal(resolved.address.toLowerCase(), address.toLowerCase());
    // It must not have opened a WalletConnect session at all.
    assert.ok(!injected.calls.some((call) => call.method === "eth_requestAccounts"));
  } finally {
    delete (globalThis as Record<string, unknown>).window;
  }
});

test("a wallet that switched accounts cannot sign the reviewed payload", async () => {
  const reviewed = "0x00000000000000000000000000000000000000aa";
  const provider = fakeProvider({ accounts: [reviewed] });

  Object.assign(provider, { isMetaMask: true, providers: [provider] });

  (globalThis as Record<string, unknown>).window = { ethereum: provider };

  try {
    const { resolveSendProvider } = await import("./execute-provider.ts");

    // The silent check still sees the reviewed account; by the time we confirm the
    // account before returning the provider, the user has switched in their wallet.
    let accountReads = 0;
    const original = provider.request;
    provider.request = (async (args: { method: string }) => {
      if (args.method === "eth_accounts") {
        accountReads += 1;
        return accountReads === 1 ? [reviewed] : ["0x00000000000000000000000000000000000000bb"];
      }
      return original(args as never);
    }) as never;

    await assert.rejects(
      () => resolveSendProvider(reviewed),
      /not the address this swap was reviewed for/,
    );
  } finally {
    delete (globalThis as Record<string, unknown>).window;
  }
});
