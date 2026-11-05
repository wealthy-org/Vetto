"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { shortAddress, walletLabel } from "@/lib/wallet-display";

interface WalletSession {
  authenticated: boolean;
  wallet?: { address: string; chainId: number; connector?: string | null };
}

/**
 * Account chip: which wallet is signed in and its address, plus sign-out.
 * Signing in is a session only — the menu states that plainly rather than
 * implying that VETTO holds the wallet.
 */
export function AccountMenu() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as WalletSession & { error?: string };
        if (!response.ok) throw new Error(result.error ?? `Session request failed (${response.status}).`);
        setSession(result);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Session status is unavailable."),
      );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as { authenticated: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? `Sign-out failed (${response.status}).`);
      setSession(result);
      setOpen(false);
      window.dispatchEvent(new Event("vetto:session-ended"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-out failed.");
    }
  }

  if (error) {
    return (
      <span className="chip text-peach" title={error}>
        Session unavailable
      </span>
    );
  }

  if (!session) {
    return <span className="chip pulse-soft text-white/50">Checking session…</span>;
  }

  if (!session.authenticated || !session.wallet) {
    return (
      <div className="flex items-center gap-2">
        <span className="chip !border-lilac/25 text-lilac/90">Preview</span>
        <Link
          href="/sign-in"
          className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:bg-white/90"
        >
          Connect wallet
        </Link>
      </div>
    );
  }

  const { address, connector } = session.wallet;
  const label = walletLabel(connector);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.05] py-1 pl-1 pr-3 text-xs transition-colors hover:border-white/25 hover:bg-white/[.09]"
      >
        <span
          aria-hidden
          className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-lilac to-peach text-[10px] font-bold text-ink"
        >
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-medium text-white">{label}</span>
        <span className="font-mono text-white/50">{shortAddress(address)}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-panel/95 p-3 text-xs shadow-2xl backdrop-blur"
        >
          <p className="text-[10px] uppercase tracking-wide text-white/35">Signed in with</p>
          <p className="mt-1 text-sm font-semibold text-white">{label}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(address).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                },
                () => setCopied(false),
              );
            }}
            title={address}
            className="mt-1 block w-full break-all text-left font-mono text-[11px] text-white/55 hover:text-white"
          >
            {address}
          </button>
          <p className="mt-1 text-[10px] text-white/30">{copied ? "Address copied" : "Click the address to copy"}</p>

          <dl className="mt-3 space-y-1 border-t border-white/10 pt-2 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-white/40">Network</dt>
              <dd className="font-medium">Robinhood Chain · 4663</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-white/40">Custody</dt>
              <dd className="font-medium">Yours — session only</dd>
            </div>
          </dl>

          <p className="mt-2 text-[10px] leading-relaxed text-white/35">
            Signing in created a session. It did not grant permission to move funds; every swap still needs your
            wallet&apos;s own approval.
          </p>

          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="mt-3 w-full rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/[.09]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
