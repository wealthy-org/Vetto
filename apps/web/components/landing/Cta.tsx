"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VortexField, type VortexControl } from "../VortexField";
import { IconArrow } from "../icons";

const PROMPTS = ["Swap 500 USDG to ETH", "Is fastclaim-hood.xyz safe?", "Swap 2 ETH to USDG privately", "Mint the NFT at nft-mint-pass.app max 0.01 ETH"];

export function Cta() {
  const router = useRouter();
  const control = useRef<VortexControl>({ strength: 0.55 });
  const [ph, setPh] = useState(0);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setPh((p) => (p + 1) % PROMPTS.length), 3200);
    return () => clearInterval(id);
  }, []);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = (value.trim() || PROMPTS[ph]!).slice(0, 500);
    router.push(`/app?ask=${encodeURIComponent(q)}`);
  };

  return (
    <section id="start" className="mx-auto max-w-6xl px-5 pb-10 pt-10">
      <div className="glass relative overflow-hidden rounded-[32px] px-6 py-24 text-center">
        <VortexField control={control} className="opacity-90" />
        <div className="relative">
          <h2 className="h-display text-5xl md:text-7xl">Take a seat.<br /><span className="grad">He’s ready.</span></h2>
          <form onSubmit={go} className="mx-auto mt-10 flex max-w-md items-center gap-2 rounded-full border border-white/12 bg-ink/70 p-1.5 pl-5 backdrop-blur">
            <label htmlFor="cta-ask" className="sr-only">What would you like to do?</label>
            <input id="cta-ask" value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} placeholder={PROMPTS[ph]} autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40" />
            <button type="submit" aria-label="Open the app with this request" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink transition-transform active:scale-90"><IconArrow className="h-4 w-4" /></button>
          </form>
          <p className="mt-4 text-xs text-white/45">Opens the app with your request ready. Nothing runs until you confirm.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[["Docs", "Read the manual", "/docs"], ["Status", "See what’s live", "#status"], ["Account", "Sign in", "/sign-in"]].map(([k, t, href]) => (
          <Link key={t} href={href!} className="glass flex items-center justify-between rounded-2xl px-5 py-4 transition-colors hover:bg-white/[.07]"><span><span className="block text-[11px] text-white/45">{k}</span><span className="text-sm font-semibold">{t}</span></span><IconArrow className="h-4 w-4 text-white/50" /></Link>
        ))}
      </div>
    </section>
  );
}
