"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { networkLabel } from "@/lib/chain-label";
import { Banker, SpeechBubble } from "./Banker";
import { Logo } from "./Logo";
import { WalletPicker } from "./WalletPicker";

/**
 * Sign-in screen. Both cards share one height band so the layout never looks
 * lopsided, and a successful connect goes straight to /app.
 */
export function AuthShell() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { authenticated?: boolean };
        if (active && body.authenticated) {
          router.replace("/app");
          return;
        }
      })
      .catch(() => {
        /* an unreadable session just means we show the picker */
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="relative flex min-h-[100svh] flex-col">
      <div className="text-field pointer-events-none absolute inset-0 -z-10" />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 text-sm">
        <Link href="/" aria-label="VETTO home">
          <Logo />
        </Link>
        <div className="flex items-center gap-5 text-white/70">
          <Link href="/" className="hover:text-white">
            Back to site
          </Link>
          <Link href="/docs" className="hover:text-white">
            Docs
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-stretch px-5 pb-10">
        <div className="grid w-full gap-4 md:grid-cols-2 md:gap-5">
          {/* Left: character, same height as the card on the right */}
          <section
            className="glass relative hidden min-h-[560px] overflow-hidden rounded-[28px] md:block"
            aria-label="VETTO"
          >
            <div className="absolute left-5 top-5 z-10 max-w-[260px]">
              <SpeechBubble>
                Your wallet stays yours. Sign in to open the desk — I never ask for a seed phrase.
              </SpeechBubble>
            </div>
            <div className="stage-glow pointer-events-none absolute inset-0" />
            <Banker
              pose="wave"
              className="absolute bottom-[-26px] left-1/2 h-[500px] w-auto -translate-x-1/2"
            />
            <div className="absolute inset-x-5 bottom-4 z-10 flex items-center justify-between text-[11px] text-white/45">
              <span>{networkLabel()}</span>
              <span>read-only until you sign</span>
            </div>
          </section>

          {/* Right: wallet picker, stretched to the same height */}
          <section
            className="auth-panel flex min-h-[560px] flex-col rounded-[28px] p-6 sm:p-7"
            aria-labelledby="auth-h"
          >
            <div className="flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-lilac">Wallet access</p>
              <h1 id="auth-h" className="h-display mt-2 text-3xl sm:text-[34px]">
                Meet your banker.
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-white/55">
                Pick the wallet you already use. One signature opens a session — it does not approve spending.
              </p>

              <div className="mt-6">
                {checking ? (
                  <div className="space-y-2" aria-hidden>
                    {[0, 1, 2, 3, 4].map((row) => (
                      <div key={row} className="h-[58px] animate-pulse rounded-2xl bg-white/[.04]" />
                    ))}
                  </div>
                ) : (
                  <WalletPicker />
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[.07] bg-white/[.03] p-4">
              <p className="text-[11px] font-semibold text-white/80">What signing in does not do</p>
              <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-white/50">
                <li>
                  <span className="mr-1.5 text-mint">✓</span>No seed phrase or private key, ever.
                </li>
                <li>
                  <span className="mr-1.5 text-mint">✓</span>No token approval or transaction.
                </li>
                <li>
                  <span className="mr-1.5 text-mint">✓</span>Every swap still needs your wallet&apos;s own confirmation.
                </li>
              </ul>
            </div>

            <p className="mt-4 text-[11px] text-white/30">
              Just looking?{" "}
              <Link href="/app" className="text-white/55 underline hover:text-white">
                Open the preview
              </Link>{" "}
              — quotes work signed out, signing does not.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
