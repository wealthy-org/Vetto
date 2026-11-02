"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextLensBackground, type LensControl } from "../TextLensBackground";
import { Mark } from "../Logo";
import { IconArrow } from "../icons";

const PROMPTS = ["Swap 500 USDG to ETH", "Is fastclaim-hood.xyz safe?", "Swap 2 ETH to USDG privately", "Mint the NFT at nft-mint-pass.app max 0.01 ETH"];

export function Cta() {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const lens = useRef<LensControl>({ fade: 1, kick: () => {} }); // starts as a flat grid, zooms in with scroll
  const [ph, setPh] = useState(0);
  const [typed, setTyped] = useState("");
  const [value, setValue] = useState("");

  // typewriter placeholder: types a prompt, holds it, moves to the next
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTyped(PROMPTS[ph]!); return; }
    const full = PROMPTS[ph]!;
    let n = 0;
    let hold = 0;
    const id = window.setInterval(() => {
      if (n < full.length) { n += 1; setTyped(full.slice(0, n)); return; }
      hold += 1;
      if (hold > 36) { window.clearInterval(id); setPh((p) => (p + 1) % PROMPTS.length); }
    }, 55);
    return () => window.clearInterval(id);
  }, [ph]);

  // scroll story: the lens zooms in as the card arrives, headline and form rise, link cards stagger in
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { lens.current.fade = 0.35; lens.current.kick(); return; }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.to(lens.current, { fade: 0, ease: "none", onUpdate: () => lens.current.kick(), scrollTrigger: { trigger: "[data-cta-card]", start: "top 75%", end: "center 40%", scrub: 0.6 } });
      gsap.from("[data-cta-card]", { y: 60, opacity: 0, scale: 0.97, ease: "none", scrollTrigger: { trigger: "[data-cta-card]", start: "top 98%", end: "top 70%", scrub: true } });
      const reveal = gsap.timeline({ scrollTrigger: { trigger: "[data-cta-card]", start: "top 55%", toggleActions: "play none none reverse" } });
      reveal.from("[data-cta-mark]", { scale: 0.6, opacity: 0, duration: 0.8, ease: "back.out(2)" }, 0)
        .from("[data-cta-line]", { yPercent: 110, duration: 1, stagger: 0.12, ease: "expo.out" }, 0.1)
        .from("[data-cta-form]", { y: 20, opacity: 0, duration: 0.8, ease: "power3.out" }, 0.5)
        .from("[data-cta-note]", { opacity: 0, duration: 0.8 }, 0.7);
      gsap.from("[data-cta-link]", { y: 28, opacity: 0, stagger: 0.1, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: "[data-cta-links]", start: "top 92%", toggleActions: "play none none reverse" } });
    }, el);
    return () => ctx.revert();
  }, []);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = (value.trim() || PROMPTS[ph]!).slice(0, 500);
    router.push(`/app?ask=${encodeURIComponent(q)}`);
  };

  return (
    <section ref={root} id="start" className="mx-auto max-w-6xl px-5 pb-10 pt-10">
      <div data-cta-card className="glass relative overflow-hidden rounded-[32px] px-6 pb-24 pt-20 text-center">
        <TextLensBackground control={lens} intro={false} anchorY={0.3} className="opacity-95" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_30%,rgba(90,50,220,.35),transparent_70%),linear-gradient(to_bottom,transparent_55%,rgba(6,4,26,.7))]" aria-hidden />
        <div className="relative">
          <div data-cta-mark className="mx-auto mb-10 grid h-16 w-16 place-items-center rounded-full bg-ink/70 backdrop-blur"><Mark size={34} /></div>
          <h2 className="h-display text-5xl md:text-7xl">
            <span className="block overflow-hidden pb-[0.08em]"><span data-cta-line className="block">Take a seat.</span></span>
            <span className="block overflow-hidden pb-[0.08em]"><span data-cta-line className="grad block">He’s ready.</span></span>
          </h2>
          <form data-cta-form onSubmit={go} className="mx-auto mt-10 flex max-w-md items-center gap-2 rounded-full border border-white/12 bg-ink/70 p-1.5 pl-5 backdrop-blur">
            <label htmlFor="cta-ask" className="sr-only">What would you like to do?</label>
            <input id="cta-ask" value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} placeholder={typed} autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45" />
            <button type="submit" aria-label="Open the app with this request" className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink transition-transform active:scale-90"><IconArrow className="h-4 w-4" /></button>
          </form>
          <p data-cta-note className="mt-4 text-xs text-white/45">Opens the app with your request ready. Nothing runs until you confirm.</p>
        </div>
      </div>
      <div data-cta-links className="mt-4 grid gap-3 sm:grid-cols-3">
        {[["Docs", "Read the manual", "/docs"], ["Status", "See what’s live", "#status"], ["Account", "Sign in", "/sign-in"]].map(([k, t, href]) => (
          <Link key={t} data-cta-link href={href!} className="glass flex items-center justify-between rounded-2xl px-5 py-4 transition-colors hover:bg-white/[.07]"><span><span className="block text-[11px] text-white/45">{k}</span><span className="text-sm font-semibold">{t}</span></span><IconArrow className="h-4 w-4 text-white/50" /></Link>
        ))}
      </div>
    </section>
  );
}
