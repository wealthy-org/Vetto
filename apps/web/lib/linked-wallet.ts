/**
 * A wallet is linked per chain: `wallet_identities` has a (chain_id, address) key,
 * and the sign-in challenge binds the chain that was current at that moment.
 *
 * That is the right model — a signature on testnet must not authorise a mainnet
 * payload — but it means a session created while the deployment was on 46630 has no
 * row for 4663. The API used to answer that with a bare
 * "No linked Robinhood Chain wallet found.", which reads like a bug in the wallet
 * rather than "you signed in on the other chain; sign in again here".
 */

export interface LinkedWalletRow {
  address: string;
  chain_id: string;
}

export interface LinkedWallet {
  address: string;
  chainId: number;
}

export interface WalletLinkLookup {
  wallet?: LinkedWallet;
  /** Chains this account *is* linked on, when the current chain is not among them. */
  otherChainIds: number[];
}

export function pickLinkedWallet(
  rows: readonly LinkedWalletRow[],
  chainId: number,
): WalletLinkLookup {
  const match = rows.find((row) => Number(row.chain_id) === chainId);

  if (match) {
    return { wallet: { address: match.address, chainId }, otherChainIds: [] };
  }

  const otherChainIds = [
    ...new Set(
      rows
        .map((row) => Number(row.chain_id))
        .filter((value) => Number.isInteger(value) && value !== chainId),
    ),
  ].sort((a, b) => a - b);

  return { otherChainIds };
}

/** The message a person can act on, with no driver detail and no address echo. */
export function walletLinkMessage(
  lookup: WalletLinkLookup,
  chainLabel: string,
  chainId: number,
): string {
  if (lookup.otherChainIds.length > 0) {
    const chains = lookup.otherChainIds.join(", ");
    return (
      `This wallet is linked on chain ${chains}, not on ${chainLabel}. ` +
      `Sign out and sign in again on this deployment so it is linked to chain ${chainId} — ` +
      `a signature on one chain cannot authorise a transaction on another. Nothing was sent.`
    );
  }

  return (
    `No wallet is linked to this account on ${chainLabel}. Sign in again, then retry. ` +
    `Nothing was sent.`
  );
}

export const WALLET_NOT_LINKED_ON_THIS_CHAIN = "WALLET_NOT_LINKED_ON_THIS_CHAIN";
