/** Display helpers shared by the account chip and the sign-in screen. */

const LABELS: Record<string, string> = {
  phantom: "Phantom",
  metamask: "MetaMask",
  rabby: "Rabby",
  coinbase: "Coinbase Wallet",
  walletconnect: "WalletConnect",
  injected: "Browser wallet",
};

export function walletLabel(connector: string | null | undefined): string {
  if (!connector) return "Wallet";
  return LABELS[connector] ?? "Wallet";
}

/** 0x1234…abcd — never truncate so aggressively that two addresses collide. */
export function shortAddress(address: string, head = 6, tail = 4): string {
  if (!address.startsWith("0x") || address.length < head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
