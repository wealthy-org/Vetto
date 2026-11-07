import {
  WALLET_OPTIONS,
  ensureRobinhoodChain,
  getInjectedProvider,
  readChainId,
  type Eip1193Provider,
  type WalletId,
} from "./injected-wallet";
import { getConnectedWallet, getWalletProvider } from "./walletconnect-provider";

/**
 * Which wallet sends the transaction.
 *
 * Sign-in supports browser wallets and WalletConnect, but the execute path used to
 * assume WalletConnect always: clicking "Execute swap" after signing in with
 * MetaMask re-opened the WalletConnect modal (the "All Wallets" list), connected a
 * second, unrelated session and then failed the chain check. This resolves the
 * wallet that actually holds the reviewed address instead.
 *
 * Order: an injected wallet that is already authorised for that address, then
 * WalletConnect. In both cases the chain is switched/added before we hand the
 * provider back, and the address is re-read so a wallet that silently switched
 * accounts cannot sign the reviewed payload.
 */

const INJECTED_IDS: readonly WalletId[] = WALLET_OPTIONS.filter(
  (wallet) => wallet.kind === "injected",
).map((wallet) => wallet.id);

export interface SendProvider {
  provider: Eip1193Provider;
  address: string;
  /** Which wallet is about to open — shown in the UI so the prompt is expected. */
  via: string;
}

async function accountsOf(provider: Eip1193Provider): Promise<string[]> {
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return Array.isArray(accounts) ? accounts.filter((a): a is string => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/** An injected wallet that already has this address authorised, if any. */
export async function authorizedInjectedWallet(
  address: string,
): Promise<{ provider: Eip1193Provider; wallet: WalletId } | null> {
  const target = address.toLowerCase();

  for (const wallet of INJECTED_IDS) {
    const provider = getInjectedProvider(wallet);
    if (!provider) continue;
    // eth_accounts is silent: no prompt, it only reports existing permission.
    const accounts = await accountsOf(provider);
    if (accounts.some((account) => account.toLowerCase() === target)) {
      return { provider, wallet };
    }
  }

  return null;
}

export async function resolveSendProvider(address: string): Promise<SendProvider> {
  const target = address.toLowerCase();

  const injected = await authorizedInjectedWallet(target);

  if (injected) {
    await ensureRobinhoodChain(injected.provider);
    const [account] = await accountsOf(injected.provider);

    if (!account || account.toLowerCase() !== target) {
      throw new Error(
        `Your wallet is showing ${account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "no account"}, ` +
          `not the address this swap was reviewed for. Switch the account in your wallet and try again. ` +
          `Nothing was sent.`,
      );
    }

    return { provider: injected.provider, address: account, via: injected.wallet };
  }

  // No browser wallet holds this address: the sign-in must have been WalletConnect.
  const { provider, address: connected } = await getConnectedWallet();

  if (connected.toLowerCase() !== target) {
    throw new Error(
      `The connected wallet is ${connected.slice(0, 6)}…${connected.slice(-4)}, not the address this swap ` +
        `was reviewed for. Reconnect the right account and try again. Nothing was sent.`,
    );
  }

  return { provider: provider as unknown as Eip1193Provider, address: connected, via: "walletconnect" };
}

/** True when a WalletConnect project id exists, i.e. the fallback can work at all. */
export function walletConnectAvailable(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
}

// Re-exported for callers that only need the chain helper.
export { ensureRobinhoodChain, readChainId, getWalletProvider };
