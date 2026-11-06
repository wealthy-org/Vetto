"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CAPABILITIES, type Capability } from "@vetto/quote-engine";
import { ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { StatusChip } from "../StatusChip";

const DOT: Record<string, string> = { verified: "#7ee2a8", planned: "#b9a2ff", unavailable: "#ff6f7d" };

export function Status() {
  const root = useRef<HTMLElement>(null);
  // The registry renders first (it is the same on every deployment); the API then
  // reports what *this* deployment can run, e.g. execution-enabled builds.
  const [caps, setCaps] = useState<Capability[]>(() => [...CAPABILITIES]);
  const total = caps.length;
  const verified = caps.filter((c) => c.status === "verified").length;
  const [animatedCount, setAnimatedCount] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/capabilities", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { capabilities?: Capability[] }) : null))
      .then((body) => {
        if (active && Array.isArray(body?.capabilities) && body.capabilities.length) setCaps(body.capabilities);
      })
      .catch(() => {
        /* the static registry stays on screen; a failed fetch never upgrades a label */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimatedCount(verified);
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // heading block rises in
      gsap.from("[data-rise]", { y: 34, opacity: 0, duration: 0.9, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 75%" } });

      // the verified count climbs while the dots fill in, scrubbed by scroll
      const counter = { v: 0 };
      const fill = gsap.timeline({ scrollTrigger: { trigger: "[data-meter]", start: "top 85%", end: "bottom 45%", scrub: 0.6 } });
      fill.from("[data-dot]", { scale: 0, opacity: 0, stagger: 0.08, ease: "back.out(2)", duration: 0.5 }, 0)
        .to(counter, {
          v: verified,
          duration: 1,
          ease: "none",
          onUpdate: () => setAnimatedCount(Math.round(counter.v)),
        }, 0);

      // every capability row slides in as it reaches the viewport; its chip lights up when settled
      gsap.utils.toArray<HTMLElement>("[data-row]").forEach((row) => {
        gsap.from(row, { y: 30, opacity: 0, ease: "none", scrollTrigger: { trigger: row, start: "top 94%", end: "top 72%", scrub: true } });
        gsap.fromTo(row.querySelector("[data-chip]"), { scale: 0.85, opacity: 0.35 }, { scale: 1, opacity: 1, ease: "back.out(2)", scrollTrigger: { trigger: row, start: "top 74%", end: "top 62%", scrub: true } });
      });
    }, el);
    return () => ctx.revert();
  }, [verified]);

  return (
    <section ref={root} id="status" className="mx-auto max-w-6xl px-5 py-28">
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2 data-rise className="h-display text-5xl md:text-6xl">What’s live, <span className="grad">and what isn’t.</span></h2>
          <p data-rise className="mt-5 max-w-md text-white/60">Every capability carries a plain status. If a route, relay or scanner has no real integration yet, it says so instead of showing a made-up number.</p>

          <div data-rise data-meter className="glass mt-8 rounded-2xl p-5">
            <div className="flex items-end gap-3">
              <span className="text-6xl font-semibold leading-none tracking-tight">
                <span data-count>{animatedCount}</span>
              </span>
              <span className="pb-1 text-sm text-white/55">of {total} capabilities verified</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5" aria-hidden>
              {caps.map((c) => <i key={c.id} data-dot className="h-3 w-3 rounded-full" style={{ background: DOT[c.status], opacity: 1 }} />)}
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-white/45">
              {[["verified", "Verified"], ["planned", "Planned"], ["unavailable", "Unavailable"]].map(([k, t]) => (<span key={k} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: DOT[k!] }} />{t}</span>))}
            </div>
          </div>

          <dl data-rise className="glass mt-4 space-y-3 rounded-2xl p-5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/50">Network</dt><dd className="text-right">Robinhood Chain</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/50">Chain ID</dt><dd className="text-right font-mono">{ROBINHOOD_CHAIN_ID} <span className="font-sans text-xs text-white/40">(from the project brief; verify before launch)</span></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/50">Token & fees</dt><dd className="text-right">Separate decision, not part of the MVP</dd></div>
          </dl>
        </div>
        <ul className="glass divide-y divide-white/5 overflow-hidden rounded-3xl">
          {caps.map((c) => (
            <li key={c.id} data-row className="flex items-start gap-4 px-5 py-4">
              <div data-chip className="w-24 shrink-0 pt-0.5"><StatusChip status={c.status} /></div>
              <div><div className="text-sm font-medium">{c.label}</div><div className="mt-0.5 text-xs leading-relaxed text-white/50">{c.note}</div></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
