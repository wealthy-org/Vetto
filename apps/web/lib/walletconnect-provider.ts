
import { WALLET_AUTH_CHAIN_ID } from "@/lib/auth-constants";
import { chainProfile } from "@/lib/chain-label";
import { ensureRobinhoodChain, type Eip1193Provider } from "@/lib/injected-wallet";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

type WalletProvider = InstanceType<
  typeof import("@walletconnect/ethereum-provider").EthereumProvider
>;

let providerPromise: Promise<WalletProvider> | null = null;

export async function getWalletProvider(): Promise<WalletProvider> {
  if (!PROJECT_ID) {
    throw new Error("WalletConnect Project ID is not configured.");
  }

  if (!providerPromise) {
    providerPromise = (async () => {
      const { EthereumProvider } = await import(
        "@walletconnect/ethereum-provider"
      );

      return EthereumProvider.init({
        projectId: PROJECT_ID,

        // The deployment's chain only: 4663 mainnet, 46630 testnet.
        //
        // Adding eip155:1 here widens the modal's "All Wallets" list, but the session
        // then settles on mainnet and the provider's own setChainId() throws while
        // restoring it, which surfaced as "Please connect using Robinhood Chain
        // Testnet · 46630" on the first execute. A wallet that is not on this chain is
        // added/switched explicitly by ensureRobinhoodChain instead.
        optionalChains: [WALLET_AUTH_CHAIN_ID],

        showQrModal: true,

        // Methods requested by VETTO
        optionalMethods: [
            "personal_sign",
            "eth_accounts",
            "eth_requestAccounts",
            "eth_call",
            "eth_getBalance",
            "eth_sendTransaction",
            "eth_getTransactionReceipt",
        ],

        optionalEvents: [
            "accountsChanged",
            "chainChanged",
            "disconnect",
        ],

        rpcMap: {
            [WALLET_AUTH_CHAIN_ID]: chainProfile().rpcPrimary,
        },

        metadata: {
            name: "VETTO",
            description: "Your DeFi banker. Every move checked.",
            url: window.location.origin,
            icons: [],
        },
        });
    })().catch((error) => {
      providerPromise = null;
      throw error;
    });
  }

  return providerPromise;
}

export async function getConnectedWallet() {
  const provider = await getWalletProvider();

  if (!provider.connected) {
    await provider.enable();
  }

  const accounts = await provider.request<string[]>({
    method: "eth_accounts",
  });

  const address = accounts?.[0];

  if (!address) {
    throw new Error("No wallet account is connected.");
  }

  // Ask the wallet for its chain and offer to switch, instead of reading the
  // provider's cached chainId — that property is undefined right after a session
  // restore, which made a correct wallet look like the wrong network.
  await ensureRobinhoodChain(provider as unknown as Eip1193Provider);

  return { provider, address };
}
