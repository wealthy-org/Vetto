"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isWalletAuthChainId, WALLET_AUTH_CHAIN_IDS } from "@/lib/auth-constants";
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

function readableError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null) {
    const details = cause as Record<string, unknown>;
    for (const key of ["shortMessage", "message", "reason"]) {
      if (typeof details[key] === "string" && details[key]) return details[key];
    }
  }
  return "Wallet sign-in failed. No transaction was sent.";
}

export function WalletConnectSignIn({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function signIn() {
    if (!PROJECT_ID || busy) return;
    setBusy(true);
    setError("");
    setProgress("Loading WalletConnect…");

    try {
      const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
      setProgress("Connecting to WalletConnect relay…");
      const provider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        optionalChains: [...WALLET_AUTH_CHAIN_IDS],
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

      setProgress("Opening the wallet connection…");
      provider.on("display_uri", () => {
        setProgress("QR connection is ready. Scan it with your wallet.");
      });
      const accounts = await provider.enable();
      setProgress("Wallet connected. Requesting the one-time login message…");
      const address = accounts[0];
      if (!address) throw new Error("No wallet account was shared.");

      if (!isWalletAuthChainId(provider.chainId)) {
        throw new Error("Switch to Ethereum Mainnet or Robinhood Chain to sign in.");
      }

      const challenge = await postJson<{ challengeId: string; message: string }>("/api/auth/challenge", {
        address,
        chainId: provider.chainId,
      });
      setProgress("Approve the one-time login message in your wallet. This is not a transaction.");
      const signature = await provider.request<unknown>({
        method: "personal_sign",
        params: [challenge.message, address],
      });
      setProgress("Verifying the wallet signature…");
      const verified = await postJson<{ authenticated: boolean }>("/api/auth/verify", {
        challengeId: challenge.challengeId,
        address,
        signature,
      });
      if (!verified.authenticated) throw new Error("The wallet session was not created.");

      router.replace("/app");
      router.refresh();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
      setProgress("");
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
        {busy ? progress : mode === "sign-up" ? "Create account with WalletConnect" : "Sign in with WalletConnect"}
        <span className="ml-auto"><StatusChip status={configured ? "planned" : "unavailable"} /></span>
      </button>
      {busy && <p role="status" className="mt-2 text-xs text-white/55">{progress}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-peach">{error}</p>}
      {!configured && <p className="mt-2 text-xs text-white/40">WalletConnect is not configured. Add its public project ID to the web app environment.</p>}
      {configured && <p className="mt-2 text-xs text-white/40">Sign-in supports Ethereum Mainnet and Robinhood Chain. The message creates a session only; no transaction is requested.</p>}
    </div>
  );
}
