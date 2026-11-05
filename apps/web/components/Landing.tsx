"use client";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Banker } from "./Banker";
import { Logo } from "./Logo";
import { Nav } from "./Nav";
import { TextLensBackground, type LensControl } from "./TextLensBackground";
import { IconArrow } from "./icons";
import { Cta } from "./landing/Cta";
import { Security } from "./landing/Security";
import { Showcase } from "./landing/Showcase";
import { Status } from "./landing/Status";

const CHIPS = ["Swap 2,500 USDG to ETH", "Is fastclaim-hood.xyz safe?", "Mint the NFT at nft-mint-pass.app max 0.01 ETH"];

/**
 * Scroll story, one pinned stage (stage height = STAGE_VH, the stage itself is 100svh and sticky):
 *   0 → 0.9   hero copy lifts away, the lens slowly relaxes into a flat grid (the grid stays)
 *   0.6 → 1.7 Vetto rises from the bottom, centred
 *   2.0 → 3.0 Vetto slides right while the "Meet Vetto" copy appears on the left
 *   2.95      Vetto starts waving; then the page scrolls on normally
 * Values are in viewport heights ("screens" of scroll).
 */
const STAGE_VH = 430;
const SCROLL_SCREENS = STAGE_VH / 100 - 1; // 3.3 screens of scrubbed scroll

export function Landing() {
  const wrap = useRef<HTMLDivElement>(null);
  const lens = useRef<LensControl>({ fade: 0, kick: () => {} });

  useLayoutEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const root = wrap.current;
    if (!root) return;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mm = gsap.matchMedia();

    mm.add({ desktop: "(min-width: 1024px)", mobile: "(max-width: 1023px)" }, (ctx) => {
      const desktop = !!(ctx.conditions as { desktop?: boolean }).desktop;
      const char = q("[data-char]");
      const banker = q<HTMLElement>("[data-char] svg");
      const glow = q("[data-glow]");
      if (!char || !banker) return;

      // --- page-load intro: the lens zooms in (canvas) while the headline rises line by line.
      if (!reduced) {
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        intro
          .from("[data-hero-pill]", { opacity: 0, y: 10, duration: 0.8 }, 0.35)
          .from("[data-line]", { yPercent: 110, duration: 1.2, stagger: 0.12 }, 0.5)
          .from("[data-hero-fade]", { opacity: 0, y: 14, duration: 0.9, stagger: 0.1 }, 0.95);
      }

      // --- the scroll story (scrubbed, so it plays backwards too)
      const screens = desktop ? SCROLL_SCREENS : 1.2;
      const U = 10 / screens;
      const H = () => window.innerHeight; 
      const shift = () => (desktop ? window.innerWidth * 0.2 : 0);

      gsap.set(char, { transformOrigin: "50% 100%" });
      gsap.set("[data-meet-copy]", { autoAlpha: 0 });
      gsap.set("[data-meet-item]", { opacity: 0, y: 26 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: reduced ? true : 0.7,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const waving = self.progress * screens >= 2.95;
            const want = waving ? "wave" : "idle";
            if (banker.getAttribute("data-pose") !== want) banker.setAttribute("data-pose", want);
          },
        },
      });

      // hero copy leaves
      tl.to("[data-hero-copy]", { y: -150, autoAlpha: 0, duration: 0.75 * U }, 0)
        .to("[data-hero-scroll]", { autoAlpha: 0, duration: 0.3 * U }, 0)
        // the lens slowly relaxes, the grid itself stays
        .to(lens.current, { fade: 1, duration: 1.8 * U, ease: "power1.inOut", onUpdate: () => lens.current.kick() }, 0.1 * U)
        // Vetto rises from the bottom
        .fromTo(char, { y: () => H() * 0.9, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 1.1 * U, ease: "power2.out" }, 0.8 * U)
        // ... then slides to the right, copy appears on the left
        .to(char, { x: shift, y: desktop ? 0 : () => H() * 0.1, scale: desktop ? 1 : 0.86, duration: 1.0 * U, ease: "power2.inOut" }, 2.0 * U)
        .to(glow, { "--gx": desktop ? "70%" : "50%", duration: 1.0 * U, ease: "power2.inOut" }, 2.0 * U)
        .to("[data-meet-copy]", { autoAlpha: 1, duration: 0.01 }, 2.2 * U)
        .to("[data-meet-item]", { opacity: 1, y: 0, duration: 0.55 * U, stagger: 0.12 * U, ease: "power2.out" }, 2.25 * U)
        .to({}, { duration: 0.1 }, 10 - 0.1); // pad so the timeline is exactly 10 long

      return () => {
        tl.scrollTrigger?.kill();
        tl.kill();
        lens.current.fade = 0;
        banker.setAttribute("data-pose", "idle");
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <div>
      <Nav />
      <main>
        {/* HERO + MEET: one pinned stage, choreographed by scroll */}
        <div ref={wrap} className="relative h-[220svh] lg:h-[430svh]">
          <div className="sticky top-0 isolate h-[100svh] overflow-hidden">
            <TextLensBackground control={lens} className="z-0" />
            <div data-glow className="stage-glow pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
            <div className="stage-vignette pointer-events-none absolute inset-0 z-[2]" aria-hidden="true" />

            {/* Vetto (z below the copy, above the grid) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex justify-center">
              <div data-char className="opacity-0 will-change-transform">
                <Banker pose="idle" fade={false} className="h-[48svh] w-auto max-w-none sm:h-[56svh] lg:h-[84svh]" />
              </div>
            </div>

            {/* HERO copy */}
            <div className="absolute inset-0 z-10 flex items-center justify-center px-5 text-center">
              <div data-hero-content className="mx-auto max-w-4xl pt-16">
                <div data-hero-copy>
                  <span data-hero-pill className="chip mb-7 !bg-ink/60 backdrop-blur"><i className="h-2 w-2 rounded-full bg-mint" /> On Robinhood Chain</span>
                  <h1 className="h-display text-[clamp(2.8rem,6.6vw,5.5rem)]">
                    <span className="block overflow-hidden pb-[0.08em]"><span data-line className="block">Your DeFi banker.</span></span>
                    <span className="block overflow-hidden pb-[0.08em]"><span data-line className="grad block">Every move checked.</span></span>
                  </h1>
                  <p data-hero-fade className="mx-auto mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-white/65 [text-shadow:0_0_24px_#06041a]">
                    Ask in plain language. Vetto reads your intent, quotes live Uniswap v4 pools on Robinhood Chain, checks public links, and simulates the exact transaction. Signing stays with your wallet — and is switched off in this deployment.
                  </p>
                  <div data-hero-fade className="mt-8 flex items-center justify-center gap-3">
                    <Link href="/sign-in" className="btn btn-primary">Launch app <IconArrow className="h-4 w-4" /></Link>
                    <a href="#meet" className="btn btn-ghost bg-ink/60 backdrop-blur">See what he does</a>
                  </div>
                </div>
              </div>
            </div>
            <div data-hero-scroll className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2 text-[11px] text-white/40" aria-hidden>
              <span className="fade-up flex flex-col items-center gap-2">Scroll<span className="scroll-line" /></span>
            </div>

            {/* MEET copy (left column on desktop, top on mobile) */}
            <div data-meet-copy className="pointer-events-none absolute inset-0 z-10 mx-auto flex max-w-6xl items-start px-5 pt-24 lg:items-center lg:pt-10">
              <div className="pointer-events-auto w-full lg:w-1/2">
                <p data-meet-item className="mb-4 text-sm text-lilac">Meet Vetto</p>
                <h2 data-meet-item className="h-display text-[2rem] sm:text-5xl md:text-6xl">Say it plainly.<br /><span className="grad">He reads the fine print.</span></h2>
                <p data-meet-item className="mt-5 max-w-md text-white/60">Preview a request or run a passive link check. Swap execution, isolated dApp scans, and burner tasks remain planned until their integrations are verified.</p>
                <ul data-meet-item className="mt-6 flex flex-wrap gap-2">
                  {CHIPS.map((c) => (<li key={c}><Link href={`/app?ask=${encodeURIComponent(c)}`} className="chip backdrop-blur"><i className="h-1.5 w-1.5 rounded-full bg-lilac" />{c}</Link></li>))}
                </ul>
              </div>
            </div>
          </div>
          {/* anchor for the "See what he does" button: where the meet scene has fully settled */}
          <span id="meet" aria-hidden className="pointer-events-none absolute left-0 h-px w-px" style={{ top: "295svh" }} />
        </div>

        {/* below the stage: normal flow */}
        <Showcase />
        <Security />
        <Status />
        <Cta />
      </main>

      <footer className="mx-auto mt-16 max-w-6xl px-5 pb-10">
        <div className="flex flex-col justify-between gap-8 border-t border-white/8 pt-10 md:flex-row">
          <div><Logo /><p className="mt-3 max-w-xs text-sm text-white/50">You ask. He checks. You decide.</p></div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-8 text-sm sm:gap-x-10">
            {[["Site", [["Introduction", "#introduction"], ["Security", "#security"], ["What’s live", "#status"]]], ["Product", [["Launch app", "/sign-in"], ["Docs", "/docs"], ["Open preview", "/app"]]]].map(([h, links]) => (
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
