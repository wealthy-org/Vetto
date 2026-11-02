"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface WalletSession {
  authenticated: boolean;
  wallet?: { address: string; chainId: number };
}

export function SessionStatus() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as WalletSession & { error?: string };
        if (!response.ok) throw new Error(result.error ?? `Session request failed (${response.status}).`);
        setSession(result);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Session status is unavailable."));
  }, []);

  async function signOut() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json() as { authenticated: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? `Sign-out failed (${response.status}).`);
      setSession(result);
      window.dispatchEvent(new Event("vetto:session-ended"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.");
    }
  }

  if (error) return <span role="status" aria-live="polite" className="chip text-peach" title={error}>Session unavailable</span>;
  if (!session) return <span role="status" aria-live="polite" className="chip"><span className="sm:hidden">Checking…</span><span className="hidden sm:inline">Checking session…</span></span>;
  if (!session.authenticated || !session.wallet) {
    return (
      <div className="flex items-center gap-3">
        <span className="chip !border-lilac/30 text-lilac"><span className="sm:hidden">Preview</span><span className="hidden sm:inline">Preview mode · signing off</span></span>
        <Link href="/sign-in" className="text-white/70 hover:text-white">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="chip !border-lilac/30 text-lilac" title={session.wallet.address}><span className="sm:hidden">Wallet</span><span className="hidden sm:inline">Wallet session · signing off</span></span>
      <button type="button" onClick={() => void signOut()} className="text-white/70 hover:text-white">Sign out</button>
    </div>
  );
}
