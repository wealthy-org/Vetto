import { CHAIN, ROBINHOOD_CHAIN_ID, rpcUrls } from "./robinhood-chain";
import { networkLabel } from "./chain-label";

/**
 * Wallet discovery and chain preparation for injected (browser) wallets.
 *
 * Every wallet here talks EIP-1193. Nothing is assumed: a wallet is only offered
 * as "detected" when its provider object is actually present, and connecting to
 * the wrong network fails loudly instead of silently signing on another chain.
 */

export type WalletId = "phantom" | "metamask" | "rabby" | "coinbase" | "walletconnect";

export interface WalletOption {
  id: WalletId;
  name: string;
  kind: "injected" | "walletconnect";
  /** Short line under the name in the picker. */
  note: string;
  download?: string;
}

export const WALLET_OPTIONS: readonly WalletOption[] = Object.freeze([
  {
    id: "phantom",
    name: "Phantom",
    kind: "injected",
    note: "Browser extension or in-app browser",
    download: "https://phantom.app",
  },
  {
    id: "metamask",
    name: "MetaMask",
    kind: "injected",
    note: "Browser extension",
    download: "https://metamask.io/download/",
  },
  {
    id: "rabby",
    name: "Rabby",
    kind: "injected",
    note: "Browser extension",
    download: "https://rabby.io",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    kind: "injected",
    note: "Extension or mobile app",
    download: "https://www.coinbase.com/wallet/downloads",
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    kind: "walletconnect",
    note: "Scan a QR code with any wallet",
  },
]);

/**
 * Open this site inside Phantom's in-app browser, where `window.phantom.ethereum`
 * is injected. Mobile users have no extension, and WalletConnect's list is not a
 * reliable way to reach Phantom from a chain it does not advertise, so a deeplink
 * is the path that actually works. Returns null during SSR.
 */
export function phantomBrowseUrl(): string | null {
  if (typeof window === "undefined") return null;

  const { origin } = window.location;
  const ref = encodeURIComponent(origin.replace(/^https?:\/\//, ""));

  return `https://phantom.app/ul/browse/${encodeURIComponent(origin)}?ref=${ref}`;
}

/** True when the visitor is on a phone, where an extension cannot be installed. */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export interface Eip1193Provider {
  /** EIP-1193. Call sites pass the expected shape as a type argument and validate it. */
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

interface InjectedWindow {
  phantom?: { ethereum?: Eip1193Provider & { isPhantom?: boolean } };
  rabby?: Eip1193Provider;
  coinbaseWalletExtension?: Eip1193Provider;
  ethereum?: Eip1193Provider & {
    isPhantom?: boolean;
    isMetaMask?: boolean;
    isRabby?: boolean;
    isCoinbaseWallet?: boolean;
    providers?: (Eip1193Provider & Record<string, unknown>)[];
  };
}

function win(): InjectedWindow | null {
  return typeof window === "undefined" ? null : (window as unknown as InjectedWindow);
}

export function getInjectedProvider(id: WalletId): Eip1193Provider | null {
  const w = win();
  if (!w) return null;
  const generic = w.ethereum;
  const multi = Array.isArray(generic?.providers) ? generic!.providers : [];

  switch (id) {
    case "phantom":
      return w.phantom?.ethereum ?? (generic?.isPhantom ? generic : null);
    case "metamask":
      return (
        multi.find((provider) => provider.isMetaMask && !provider.isRabby) ??
        (generic?.isMetaMask && !generic.isRabby ? generic : null)
      );
    case "rabby":
      return w.rabby ?? (generic?.isRabby ? generic : null);
    case "coinbase":
      return (
        w.coinbaseWalletExtension ??
        multi.find((provider) => provider.isCoinbaseWallet) ??
        (generic?.isCoinbaseWallet ? generic : null)
      );
    case "walletconnect":
      return null;
  }
}

/** Best-effort detection for the picker; absence just means "not installed here". */
export function detectedWallets(): Record<WalletId, boolean> {
  return {
    phantom: Boolean(getInjectedProvider("phantom")),
    metamask: Boolean(getInjectedProvider("metamask")),
    rabby: Boolean(getInjectedProvider("rabby")),
    coinbase: Boolean(getInjectedProvider("coinbase")),
    walletconnect: true,
  };
}

const CHAIN_HEX = `0x${ROBINHOOD_CHAIN_ID.toString(16)}`;

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return undefined;
}

/**
 * The chain a provider is on, asked directly.
 *
 * Never read `provider.chainId`: WalletConnect instances expose that as a cached
 * property that is still undefined (or stale) right after a session restore, which
 * made a perfectly correct wallet look like it was on the wrong network.
 */
export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const value = await provider.request({ method: "eth_chainId" });
    const parsed = typeof value === "string" ? Number.parseInt(value, 16) : value;
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Make sure the wallet is on Robinhood Chain. Wallets that do not know the chain
 * are asked to add it once; if they still refuse, we stop rather than sign on the
 * wrong network.
 */
export async function ensureRobinhoodChain(provider: Eip1193Provider): Promise<void> {
  const current = await readChainId(provider);
  if (current === ROBINHOOD_CHAIN_ID) return;

  const addChain = {
    chainId: CHAIN_HEX,
    chainName: CHAIN.name,
    nativeCurrency: CHAIN.nativeCurrency,
    rpcUrls: [rpcUrls().primary],
    blockExplorerUrls: [CHAIN.explorer],
  };

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (error) {
    const code = errorCode(error);
    // 4902 = unknown chain on most wallets; some return -32603 instead.
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addChain],
      });
      return;
    }
    throw new Error(
      `Your wallet would not switch to ${networkLabel()} (it answered ${code ? `code ${code}` : "with an error"}). ` +
        `Switch the network in your wallet and try again. Nothing was sent.`,
    );
  }

  const after = await readChainId(provider);
  if (after !== ROBINHOOD_CHAIN_ID) {
    throw new Error(
      `Your wallet is still on chain ${after ?? "unknown"}, not ${networkLabel()}. ` +
        `Approve the network prompt in your wallet and try again. Nothing was sent.`,
    );
  }
}
