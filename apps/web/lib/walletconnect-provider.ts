
import { WALLET_AUTH_CHAIN_ID } from "@/lib/auth-constants";
import { chainProfile, networkLabel } from "@/lib/chain-label";

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

        // The deployment's chain: 4663 mainnet, 46630 testnet.
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

  if (Number(provider.chainId) !== WALLET_AUTH_CHAIN_ID) {
    throw new Error(`Please connect using ${networkLabel()}.`);
  }

  return { provider, address };
}
