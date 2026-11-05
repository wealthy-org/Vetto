"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  WALLET_OPTIONS,
  detectedWallets,
  type WalletId,
} from "@/lib/injected-wallet";
import {
  readableError,
  signInWithInjectedWallet,
  signInWithWalletConnect,
} from "@/lib/wallet-signin-client";
import { IconArrow } from "./icons";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/** Neutral badges keep the picker readable without borrowing anyone's brand mark. */
const BADGE: Record<WalletId, { label: string; className: string }> = {
  phantom: { label: "P", className: "bg-[#ab9ff2] text-[#1b1440]" },
  metamask: { label: "M", className: "bg-[#f6851b] text-[#231204]" },
  rabby: { label: "R", className: "bg-[#8697ff] text-[#0d1230]" },
  coinbase: { label: "C", className: "bg-[#0052ff] text-white" },
  walletconnect: { label: "WC", className: "bg-[#3b99fc] text-white" },
};

export function WalletPicker() {
  const router = useRouter();
  const [busy, setBusy] = useState<WalletId | "">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [detected, setDetected] = useState<Record<WalletId, boolean> | null>(null);

  // Detection needs the browser, so it runs after mount to keep SSR output stable.
  useEffect(() => {
    setDetected(detectedWallets());
  }, []);

  const walletConnectReady = Boolean(PROJECT_ID);

  const onSignIn = async (id: WalletId) => {
    if (busy) return;
    setError("");
    setProgress("");
    setBusy(id);

    try {
      const result =
        id === "walletconnect"
          ? await signInWithWalletConnect(setProgress)
          : await signInWithInjectedWallet(id, setProgress);

      setProgress(`Signed in as ${result.address.slice(0, 6)}…${result.address.slice(-4)}. Opening VETTO…`);
      router.replace("/app");
      router.refresh();
    } catch (cause) {
      setError(readableError(cause));
      setProgress("");
    } finally {
      setBusy("");
    }
  };

  const options = useMemo(
    () =>
      WALLET_OPTIONS.map((wallet) => {
        const isWalletConnect = wallet.kind === "walletconnect";
        const installed = detected ? detected[wallet.id] : null;
        const disabled = busy !== "" || (isWalletConnect && !walletConnectReady);
        return { wallet, installed, isWalletConnect, disabled };
      }),
    [detected, busy, walletConnectReady],
  );

  return (
    <div className="flex h-full flex-col">
      <ul className="space-y-2">
        {options.map(({ wallet, installed, isWalletConnect, disabled }) => (
          <li key={wallet.id}>
            <button
              type="button"
              onClick={() => void onSignIn(wallet.id)}
              disabled={disabled}
              aria-busy={busy === wallet.id}
              className="group flex w-full items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.04] px-3.5 py-3 text-left transition-colors hover:border-lilac/40 hover:bg-white/[.07] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span
                aria-hidden
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold ${BADGE[wallet.id].className}`}
              >
                {BADGE[wallet.id].label}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{wallet.name}</span>
                  {installed === true && (
                    <span className="rounded-full bg-mint/15 px-1.5 py-0.5 text-[10px] font-medium text-mint">
                      detected
                    </span>
                  )}
                  {installed === false && !isWalletConnect && (
                    <span className="rounded-full bg-white/[.07] px-1.5 py-0.5 text-[10px] text-white/45">
                      not installed
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-white/45">
                  {busy === wallet.id && progress ? progress : wallet.note}
                </span>
              </span>

              <IconArrow className="h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-coral/30 bg-coral/[.07] px-3 py-2 text-xs leading-relaxed text-coral">
          {error}
        </p>
      )}

      {busy && !error && (
        <p role="status" aria-live="polite" className="mt-3 text-xs leading-relaxed text-white/55">
          {progress}
        </p>
      )}

      {!walletConnectReady && (
        <p className="mt-3 text-[11px] leading-relaxed text-white/35">
          WalletConnect needs <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>. Browser
          wallets above work without it.
        </p>
      )}
    </div>
  );
}
