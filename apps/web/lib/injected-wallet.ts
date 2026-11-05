import { CHAIN, ROBINHOOD_CHAIN_ID, rpcUrls } from "./robinhood-chain";

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

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
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
 * Make sure the wallet is on Robinhood Chain. Wallets that do not know the chain
 * are asked to add it once; if they still refuse, we stop rather than sign on the
 * wrong network.
 */
export async function ensureRobinhoodChain(provider: Eip1193Provider): Promise<void> {
  const current = (await provider.request({ method: "eth_chainId" })) as string;
  if (typeof current === "string" && Number.parseInt(current, 16) === ROBINHOOD_CHAIN_ID) return;

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
    throw new Error("Switch your wallet to Robinhood Chain (4663) to use VETTO.");
  }

  const after = (await provider.request({ method: "eth_chainId" })) as string;
  if (typeof after !== "string" || Number.parseInt(after, 16) !== ROBINHOOD_CHAIN_ID) {
    throw new Error("Switch your wallet to Robinhood Chain (4663) to use VETTO.");
  }
}
