"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WALLET_AUTH_CHAIN_ID } from "@/lib/auth-constants";
import { StatusChip } from "./StatusChip";
import { IconLock } from "./icons";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
  return result;
}

export function WalletConnectSignIn({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (!PROJECT_ID || busy) return;
    setBusy(true);
    setError("");

    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      const provider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        optionalChains: [WALLET_AUTH_CHAIN_ID],
        showQrModal: true,
        methods: ["personal_sign", "eth_requestAccounts"],
        events: ["accountsChanged", "chainChanged"],
        metadata: {
          name: "VETTO",
          description: "Your DeFi banker. Every move checked.",
          url: window.location.origin,
          icons: [],
        },
      });

      const accounts = await provider.enable();
      const address = accounts[0];
      if (!address) throw new Error("No wallet account was shared.");

      if (provider.chainId !== WALLET_AUTH_CHAIN_ID) {
        throw new Error(`Connect to Ethereum Mainnet (chain ID ${WALLET_AUTH_CHAIN_ID}) to sign in.`);
      }

      const challenge = await postJson<{ challengeId: string; message: string }>("/api/auth/challenge", { address });
      const signature = await provider.request<unknown>({
        method: "personal_sign",
        params: [challenge.message, address],
      });
      const verified = await postJson<{ authenticated: boolean }>("/api/auth/verify", {
        challengeId: challenge.challengeId,
        address,
        signature,
      });
      if (!verified.authenticated) throw new Error("The wallet session was not created.");

      router.replace("/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet sign-in failed. No transaction was sent.");
    } finally {
      setBusy(false);
    }
  }

  const configured = Boolean(PROJECT_ID);
  return (
    <div>
      <button
        type="button"
        disabled={!configured || busy}
        onClick={() => void signIn()}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
      >
        <IconLock className="h-4 w-4" />
        {busy ? "Waiting for wallet…" : mode === "sign-up" ? "Create account with WalletConnect" : "Sign in with WalletConnect"}
        <span className="ml-auto"><StatusChip status={configured ? "planned" : "unavailable"} /></span>
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-peach">{error}</p>}
      {!configured && <p className="mt-2 text-xs text-white/40">WalletConnect is not configured. Add its public project ID to the web app environment.</p>}
    </div>
  );
}
