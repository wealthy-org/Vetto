import { activeProfile } from "./chain-profile";

/** Chain of the active deployment: 4663 on mainnet, 46630 on testnet. */
export const ROBINHOOD_CHAIN_ID = activeProfile().chainId;
export const WALLET_AUTH_CHAIN_ID = ROBINHOOD_CHAIN_ID;

export const WALLET_AUTH_CHAIN_IDS = [
  WALLET_AUTH_CHAIN_ID,
] as const;

export function isWalletAuthChainId(
  value: unknown,
): value is (typeof WALLET_AUTH_CHAIN_IDS)[number] {
  return (
    typeof value === "number" &&
    WALLET_AUTH_CHAIN_IDS.some((chainId) => chainId === value)
  );
}
