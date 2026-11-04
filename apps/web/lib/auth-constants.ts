export const ROBINHOOD_CHAIN_ID = 4663;
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
