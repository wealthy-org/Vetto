
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WALLET_AUTH_CHAIN_ID } from "@/lib/auth-constants";
import { networkLabel } from "@/lib/chain-label";
import { IconLock } from "./icons";
import { getWalletProvider } from "@/lib/walletconnect-provider";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json() as T & { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? `Request failed (${response.status}).`);
  }

  return result;
}

function readableError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;

  if (typeof cause === "object" && cause !== null) {
    const details = cause as Record<string, unknown>;

    for (const key of ["shortMessage", "message", "reason"]) {
      if (typeof details[key] === "string" && details[key]) {
        return details[key] as string;
      }
    }
  }

  return "Wallet sign-in failed. No transaction was sent.";
}

export function WalletConnectSignIn({
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function signIn() {
    if (busy) return;

    if (!PROJECT_ID) {
      setError("WalletConnect is not configured. Please contact the site administrator.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      setProgress("Initializing WalletConnect...");

      const provider = await getWalletProvider();

      provider.on("display_uri", () => {
        setProgress("Scan the QR code with your wallet...");
      });

      setProgress("Opening wallet connection...");

      const accounts = await provider.enable();
      const address = accounts?.[0];

      if (!address) {
        throw new Error("No wallet account was shared.");
      }

      if (Number(provider.chainId) !== WALLET_AUTH_CHAIN_ID) {
        throw new Error(
          `Please connect using ${networkLabel()}.`,
        );
      }

      setProgress("Requesting secure login challenge...");

      const challenge = await postJson<{
        challengeId: string;
        message: string;
      }>("/api/auth/challenge", {
        address,
        chainId: Number(provider.chainId),
      });

      if (!challenge.challengeId || !challenge.message) {
        throw new Error("The server returned an invalid login challenge.");
      }

      setProgress("Please approve the login signature in your wallet. This is not a transaction.");

      const signature = await provider.request<string>({
        method: "personal_sign",
        params: [challenge.message, address],
      });

      if (!signature) {
        throw new Error("The wallet did not return a signature.");
      }

      setProgress("Verifying your wallet signature...");

      const verified = await postJson<{
        authenticated: boolean;
      }>("/api/auth/verify", {
        challengeId: challenge.challengeId,
        address,
        signature,
      });

      if (!verified.authenticated) {
        throw new Error("Wallet verification failed. Please try again.");
      }

      setProgress("Login successful. Opening VETTO...");

      router.replace("/app");
      router.refresh();
    } catch (cause) {
      setError(readableError(cause));
      setProgress("");
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
        aria-busy={busy}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-white/[.07] px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-white/[.12] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconLock className="h-4 w-4 shrink-0" />

        <span className="min-w-0 flex-1">
          {busy ? progress : "Connect wallet"}
        </span>

        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
            configured
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-white/10 text-white/50"
          }`}
        >
          {configured ? "READY" : "SETUP REQUIRED"}
        </span>
      </button>

      {busy && (
        <p role="status" className="mt-2 text-xs text-white/55">
          {progress}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-peach">
          {error}
        </p>
      )}

      {!configured && (
        <p className="mt-2 text-xs text-white/40">
          WalletConnect Project ID is missing from the web app environment.
        </p>
      )}

      {configured && (
        <p className="mt-2 text-xs text-white/40">
          Secure wallet authentication on {networkLabel()}.
          Signing in does not authorize or send transactions.
        </p>
      )}
    </div>
  );
}
