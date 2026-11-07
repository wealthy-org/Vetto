"use client";

import { WALLET_AUTH_CHAIN_ID } from "./auth-constants";
import { networkLabel } from "./chain-label";
import {
  ensureRobinhoodChain,
  getInjectedProvider,
  type Eip1193Provider,
  type WalletId,
} from "./injected-wallet";

/**
 * One sign-in flow for every wallet type: connect → confirm the chain → sign a
 * single-use login message → verify server-side. The signature authorizes a
 * session only; it never authorizes a transaction.
 */

interface Challenge {
  challengeId: string;
  message: string;
}

type Progress = (message: string) => void;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as T & { error?: string; hint?: string; code?: string };

  if (!response.ok) {
    // The server sends `hint` when the failure is a setup problem (missing
    // RATE_LIMIT_SALT, no migrations, unreachable database) so the person is not
    // left with a dead end. Show it after the plain-language error.
    const message = result.error ?? `Request failed (${response.status}).`;
    throw new Error(result.hint ? `${message} ${result.hint}` : message);
  }

  return result;
}

export function readableError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  if (typeof cause === "object" && cause !== null) {
    const details = cause as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "reason"]) {
      if (typeof details[key] === "string" && details[key]) return details[key] as string;
    }
  }

  return "Wallet sign-in failed. No transaction was sent.";
}

async function signInWithProvider(
  provider: Eip1193Provider,
  connector: WalletId,
  progress: Progress,
): Promise<{ address: string }> {
  progress("Opening your wallet…");

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];

  if (!address) throw new Error("Your wallet did not share an account.");

  progress("Confirming Robinhood Chain…");
  await ensureRobinhoodChain(provider);

  const chain = (await provider.request({ method: "eth_chainId" })) as string;
  if (typeof chain !== "string" || Number.parseInt(chain, 16) !== WALLET_AUTH_CHAIN_ID) {
    throw new Error(`VETTO signs in on ${networkLabel()} only.`);
  }

  progress("Requesting a sign-in challenge…");
  const challenge = await postJson<Challenge>("/api/auth/challenge", {
    address,
    chainId: WALLET_AUTH_CHAIN_ID,
  });

  if (!challenge.challengeId || !challenge.message) {
    throw new Error("The server returned an invalid sign-in challenge.");
  }

  progress("Approve the sign-in message in your wallet. This is not a transaction.");
  const signature = (await provider.request({
    method: "personal_sign",
    params: [challenge.message, address],
  })) as string;

  if (!signature) throw new Error("Your wallet did not return a signature.");

  progress("Verifying the signature…");
  const verified = await postJson<{ authenticated: boolean }>("/api/auth/verify", {
    challengeId: challenge.challengeId,
    address,
    signature,
    connector,
  });

  if (!verified.authenticated) throw new Error("Wallet verification failed. Please try again.");

  return { address };
}

export async function signInWithInjectedWallet(
  id: Exclude<WalletId, "walletconnect">,
  progress: Progress,
): Promise<{ address: string }> {
  const provider = getInjectedProvider(id);

  if (!provider) {
    throw new Error("That wallet was not found in this browser. Install it, or use WalletConnect.");
  }

  return signInWithProvider(provider, id, progress);
}

export async function signInWithWalletConnect(
  progress: Progress,
): Promise<{ address: string }> {
  const { getWalletProvider } = await import("./walletconnect-provider");
  const provider = await getWalletProvider();

  provider.on("display_uri", () => progress("Scan the QR code with your wallet…"));

  progress("Opening WalletConnect…");
  if (!provider.connected) await provider.enable();

  return signInWithProvider(provider as unknown as Eip1193Provider, "walletconnect", progress);
}
