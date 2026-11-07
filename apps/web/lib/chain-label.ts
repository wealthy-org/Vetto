import { activeProfile, type ChainProfile } from "./chain-profile";

/**
 * Presentation helpers for the active chain. Client-safe: on the client the
 * profile comes from `NEXT_PUBLIC_VETTO_CHAIN_PROFILE`, on the server from
 * `VETTO_CHAIN_PROFILE`.
 */

export function chainProfile(): ChainProfile {
  return activeProfile();
}

/** "Robinhood Chain · 4663" or "Robinhood Chain Testnet · 46630". */
export function networkLabel(): string {
  const profile = activeProfile();
  return `${profile.name} · ${profile.chainId}`;
}

/** Short version for chips and inline copy. */
export function networkShortLabel(): string {
  return activeProfile().name;
}

/**
 * True only for a testnet deployment. Every money-shaped surface must read
 * this before letting a number look real.
 */
export function isTestnetDeployment(): boolean {
  return activeProfile().isTestnet;
}

/** The one sentence a testnet deployment has to keep saying. */
export const TESTNET_DISCLOSURE =
  "Testnet · test funds only. Nothing here has value and nothing trades real assets.";
