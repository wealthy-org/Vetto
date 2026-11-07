"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  WALLET_OPTIONS,
  detectedWallets,
  isMobileBrowser,
  phantomBrowseUrl,
  type WalletId,
} from "@/lib/injected-wallet";
import {
  readableError,
  signInWithInjectedWallet,
  signInWithWalletConnect,
} from "@/lib/wallet-signin-client";
import { IconArrow } from "./icons";
import { WALLET_LOGO } from "./wallet-logos";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function WalletPicker() {
  const router = useRouter();
  const [busy, setBusy] = useState<WalletId | "">("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [detected, setDetected] = useState<Record<WalletId, boolean> | null>(null);
  const [phantomLink, setPhantomLink] = useState<string | null>(null);

  // Detection needs the browser, so it runs after mount to keep SSR output stable.
  useEffect(() => {
    setDetected(detectedWallets());
    setPhantomLink(isMobileBrowser() ? phantomBrowseUrl() : null);
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
                className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.35)] ring-1 ring-black/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={WALLET_LOGO[wallet.id]}
                  alt=""
                  width={28}
                  height={28}
                  draggable={false}
                  className="h-7 w-7 object-contain"
                />
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

      {/* On a phone there is no extension to detect, so offer the in-app browser. */}
      {phantomLink && detected?.phantom === false && (
        <a
          href={phantomLink}
          className="mt-3 block rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-center text-[11.5px] text-white/60 hover:border-lilac/40 hover:text-white"
        >
          On mobile? Open VETTO inside Phantom
        </a>
      )}

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
