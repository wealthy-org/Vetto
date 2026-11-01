"use client";
import Link from "next/link";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Banker } from "./Banker";
import { Logo } from "./Logo";
import { Nav } from "./Nav";
import { TextLensBackground } from "./TextLensBackground";
import { IconArrow } from "./icons";
import { Cta } from "./landing/Cta";
import { Security } from "./landing/Security";
import { Showcase } from "./landing/Showcase";
import { Status } from "./landing/Status";

const CHIPS = ["Swap 2,500 USDG to ETH", "Is fastclaim-hood.xyz safe?", "Mint the NFT at nft-mint-pass.app max 0.01 ETH"];

export function Landing() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // The headline rises line by line over the text lens.
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.from("[data-hero-pill]", { opacity: 0, y: 10, duration: 0.7 })
        .from("[data-line]", { yPercent: 110, duration: 1.1, stagger: 0.12 }, "-=0.4")
        .from("[data-hero-fade]", { opacity: 0, y: 14, duration: 0.8, stagger: 0.1 }, "-=0.6");

      const hero = document.querySelector<HTMLElement>("[data-hero]");
      const meet = document.querySelector<HTMLElement>("#meet");
      const banker = meet?.querySelector<HTMLElement>("[data-rise]");

      if (hero) {
        gsap.to("[data-hero-copy]", {
          y: -150,
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
        gsap.to("[data-hero-lens]", {
          opacity: 0,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
        });
      }

      if (meet && banker) {
        let bankerCenterX = 0;
        let bankerDocumentCenterY = 0;
        const measureBanker = () => {
          gsap.set(banker, { clearProps: "transform,opacity" });
          const bounds = banker.getBoundingClientRect();
          bankerCenterX = bounds.left + bounds.width / 2;
          bankerDocumentCenterY = bounds.top + window.scrollY + bounds.height / 2;
        };
        const updateBanker = (progress: number) => {
          const reveal = Math.min(1, progress / 0.4);
          const move = Math.min(1, Math.max(0, (progress - 0.4) / 0.6));
          const centerX = window.innerWidth / 2 - bankerCenterX;
          const centerY = window.innerHeight / 2 - (bankerDocumentCenterY - window.scrollY);

          gsap.set(banker, {
            x: centerX * (1 - move),
            y: centerY * (1 - move),
            scale: 0.82 + 0.18 * reveal,
            opacity: reveal,
          });
        };
        measureBanker();
        const transition = ScrollTrigger.create({
          trigger: meet,
          start: "top 75%",
          end: "top 10%",
          scrub: true,
          invalidateOnRefresh: true,
          onRefresh: (self) => {
            measureBanker();
            updateBanker(self.progress);
          },
          onUpdate: (self) => updateBanker(self.progress),
        });
        updateBanker(transition.progress);
        gsap.fromTo("[data-meet-copy]", { y: 32, opacity: 0 }, {
          y: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: { trigger: meet, start: "top 65%", end: "top 15%", scrub: true },
        });
      }
    });
    return () => mm.revert();
  }, []);

  return (
    <div>
      <Nav />
      <main>
        {/* HERO */}
        <section data-hero className="relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-5 text-center">
          <div className="text-field pointer-events-none absolute inset-0 z-0" aria-hidden="true" />
          <TextLensBackground anchorSelector="[data-hero-content]" className="z-[1]" />
          <div className="hero-vignette pointer-events-none absolute inset-0 z-[2]" aria-hidden="true" />
          <div data-hero-content className="relative z-10 mx-auto max-w-3xl pt-16">
            <span data-hero-pill className="chip mb-7 !bg-ink/60 backdrop-blur"><i className="h-2 w-2 rounded-full bg-mint" /> On Robinhood Chain</span>
            <div data-hero-copy>
              <h1 className="h-display text-[clamp(3rem,9vw,6.5rem)]">
                <span className="block overflow-hidden pb-[0.08em]"><span data-line className="block">Your DeFi banker.</span></span>
                <span className="block overflow-hidden pb-[0.08em]"><span data-line className="grad block">Every move checked.</span></span>
              </h1>
              <p data-hero-fade className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/65 [text-shadow:0_0_24px_#06041a]">
                Tell Vetto what you want in plain words. He finds real routes, inspects the risks, and waits for your signature before anything moves.
              </p>
              <div data-hero-fade className="mt-8 flex items-center justify-center gap-3">
                <Link href="/app" className="btn btn-primary">Launch app <IconArrow className="h-4 w-4" /></Link>
                <a href="#meet" className="btn btn-ghost bg-ink/60 backdrop-blur">See what he does</a>
              </div>
            </div>
          </div>
          <span className="absolute bottom-6 z-10 text-[11px] text-white/35" aria-hidden>Scroll</span>
        </section>

        {/* MEET */}
        <section id="meet" className="relative isolate mx-auto grid min-h-[110svh] max-w-6xl items-end gap-6 overflow-hidden px-5 pt-32 lg:grid-cols-2 lg:items-center">
          <div className="meet-background pointer-events-none absolute inset-y-0 left-1/2 z-0 w-screen -translate-x-1/2" aria-hidden="true">
            <div className="text-field absolute inset-0" />
            <div className="hero-vignette meet-vignette absolute inset-0" />
          </div>
          <div data-meet-copy className="relative z-10 pb-10 lg:pb-0">
            <p className="mb-4 text-sm text-lilac">Meet Vetto</p>
            <h2 className="h-display text-5xl md:text-6xl">Say it plainly.<br /><span className="grad">He reads the fine print.</span></h2>
            <p className="mt-5 max-w-md text-white/60">Swap at a fair rate, inspect a dApp before you connect, or hand off a task. He shows his reading of your request first, so there are no surprises.</p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {CHIPS.map((c) => (<li key={c}><Link href={`/app?ask=${encodeURIComponent(c)}`} className="chip"><i className="h-1.5 w-1.5 rounded-full bg-lilac" />{c}</Link></li>))}
            </ul>
          </div>
          <div data-rise className="relative z-10 mx-auto -mb-6 w-full max-w-[460px] lg:mb-0"><Banker pose="wave" className="h-auto w-full" /></div>
        </section>

        <Showcase />
        <Security />
        <Status />
        <Cta />
      </main>

      <footer className="mx-auto mt-16 max-w-6xl px-5 pb-10">
        <div className="flex flex-col justify-between gap-8 border-t border-white/8 pt-10 md:flex-row">
          <div><Logo /><p className="mt-3 max-w-xs text-sm text-white/50">You ask. He checks. You decide.</p></div>
          <div className="grid grid-cols-3 gap-10 text-sm">
            {[["Site", [["Introduction", "#introduction"], ["Security", "#security"], ["What’s live", "#status"]]], ["Product", [["Launch app", "/app"], ["Docs", "/docs"], ["Sign in", "/sign-in"]]]].map(([h, links]) => (
              <div key={h as string}><div className="mb-3 text-xs text-white/40">{h as string}</div><ul className="space-y-2">{(links as string[][]).map(([t, href]) => (<li key={t}><Link href={href!} className="text-white/75 hover:text-white">{t}</Link></li>))}</ul></div>
            ))}
          </div>
        </div>
        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-white/35">
          Vetto is an independent product and is not affiliated with Sotto Fi. “VETTO” is a working name, not cleared as a trademark. Safety scores are heuristic and never a guarantee. Nothing here is financial advice.
        </p>
      </footer>
    </div>
  );
}
