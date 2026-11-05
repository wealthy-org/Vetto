"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { capabilityById } from "@vetto/quote-engine";
import { Banker, SpeechBubble, type Pose } from "../Banker";
import { Mark } from "../Logo";
import { StatusChip } from "../StatusChip";
import { IconArrow, IconBrowser, IconKey, IconLock, IconShield, IconSwap } from "../icons";
import { SampleCheck, SampleLive, SamplePrivate, SampleRoute, SampleTask } from "./samples";

const STEPS = [
  { id: "swap", Icon: IconSwap, Card: SampleRoute, cap: "route-direct", pose: "clasp" as Pose, title: "Real routes, when verified.",
    body: "Live swap routes are not connected yet. This sample illustrates how Vetto will rank verified executable quotes by net output without inventing options.",
    cmd: "swap 2500 USDG to ETH", say: "No verified route is connected yet, so I won't show a made-up price." },
  { id: "private", Icon: IconLock, Card: SamplePrivate, cap: "private-relay", pose: "think" as Pose, title: "Private, when it's truly possible.",
    body: "No Robinhood Chain private relay is verified, so Vetto does not offer private submission. Confirmed onchain transactions are public.",
    cmd: "swap 2 ETH to USDG privately", say: "No relay, no pretending. I'll tell you plainly instead of dressing up a public route." },
  { id: "check", Icon: IconShield, Card: SampleCheck, cap: "dapp-sandbox", pose: "idle" as Pose, title: "Inspected before you connect.",
    body: "Vetto currently checks URL policy and DNS only; it does not visit the site. Isolated-browser scans and approval capture are planned.",
    cmd: "is fastclaim-hood.xyz safe?", say: "This is sample data. Passive link checks cannot confirm what a site will do." },
  { id: "agent", Icon: IconKey, Card: SampleTask, cap: "agent-tasks", pose: "wave" as Pose, title: "A capped burner does the clicking.",
    body: "Burner-wallet mint and claim tasks are planned, not available. Any future task must use an explicit spend cap and a separate wallet.",
    cmd: "mint the NFT at nft-mint-pass.app max 0.01 ETH", say: "I can't run mint or claim tasks yet. No wallet action was taken." },
  { id: "live", Icon: IconBrowser, Card: SampleLive, cap: "live-browser", pose: "live" as Pose, title: "Watch it work. Grab the controls.",
    body: "Isolated live-browser sessions and user takeover are planned; Vetto does not currently open or stream third-party sites.",
    cmd: "open demo-dex.app live", say: "Live browser sessions are not available yet. This panel is only an illustration." },
];
const N = STEPS.length;
const STEP_DEG = 360 / N;

function arc(r: number, from: number, to: number) {
  const p = (d: number) => [125 + Math.cos(d) * r, 125 + Math.sin(d) * r];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M${x1!.toFixed(1)} ${y1!.toFixed(1)}A${r} ${r} 0 0 1 ${x2!.toFixed(1)} ${y2!.toFixed(1)}`;
}

function Wheel({ step }: { step: number }) {
  const wheel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wheel.current;
    if (!el) return;
    // the active node always docks at 3 o'clock, where the chevrons point
    gsap.to(el, { rotation: 90 - STEP_DEG * step, duration: 0.9, ease: "power3.out" });
    gsap.to(el.querySelectorAll("[data-node]"), { rotation: STEP_DEG * step - 90, duration: 0.9, ease: "power3.out" });
  }, [step]);
  const R = 92;
  const gap = 0.3; // radians left free around each node for the arrow arcs
  return (
    <div className="relative mx-auto h-[250px] w-[250px]" aria-hidden>
      <div className="absolute inset-0 rounded-full border border-white/10 bg-[radial-gradient(circle,rgba(110,70,230,.22),transparent_70%)]" />
      <svg viewBox="0 0 250 250" className="ring-spin-slow absolute inset-0 h-full w-full">
        <defs><path id="wheel-text" d="M125 125m-62 0a62 62 0 1 1 124 0a62 62 0 1 1-124 0" /></defs>
        <text fontSize="7.5" letterSpacing="2.6" fill="rgba(201,182,255,.45)" fontWeight="600"><textPath href="#wheel-text">{"vetto · ".repeat(9)}</textPath></text>
      </svg>
      <div ref={wheel} className="absolute inset-0">
        <svg viewBox="0 0 250 250" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="wheel-arc" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c9b6ff" /><stop offset="1" stopColor="#ffb59a" /></linearGradient>
            <marker id="wheel-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto"><path d="M1 1 9 5 1 9Z" fill="#ffb59a" /></marker>
          </defs>
          {STEPS.map((s, i) => {
            const a0 = (i / N) * Math.PI * 2 - Math.PI / 2 + gap;
            const a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2 - gap;
            const on = i === step;
            return <path key={s.id} d={arc(R, a0, a1)} fill="none" stroke={on ? "url(#wheel-arc)" : "rgba(201,182,255,.28)"} strokeWidth={on ? 6 : 5} strokeLinecap="round" markerEnd={on ? "url(#wheel-head)" : undefined} style={{ transition: "stroke .5s" }} />;
          })}
        </svg>
        {STEPS.map((s, i) => {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const active = i === step;
          return (
            <div key={s.id} data-node className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border transition-colors duration-500"
              style={{ left: `${125 + Math.cos(a) * R}px`, top: `${125 + Math.sin(a) * R}px`, background: active ? "linear-gradient(120deg,#c9b6ff,#ffb59a)" : "rgba(14,10,40,.9)", borderColor: active ? "transparent" : "rgba(255,255,255,.12)", color: active ? "#1a1033" : "rgba(255,255,255,.55)" }}>
              <s.Icon />
            </div>
          );
        })}
      </div>
      <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full glass"><Mark size={34} /></div>
      <div className="absolute right-[-30px] top-1/2 flex -translate-y-1/2 text-peach">
        {[0, 1, 2].map((k) => <span key={k} className="chev -mr-1.5" style={{ animationDelay: `${k * 0.18}s` }}><IconArrow className="h-4 w-4" /></span>)}
      </div>
    </div>
  );
}

function StepText({ i }: { i: number }) {
  const s = STEPS[i]!;
  const cap = capabilityById(s.cap);
  return (
    <div key={s.id} className="step-in">
      <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">{s.body}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/app?ask=${encodeURIComponent(s.cmd)}`} className="chip">Try “{s.cmd.length > 34 ? `${s.cmd.slice(0, 32)}…` : s.cmd}” <IconArrow className="h-3 w-3" /></Link>
        {cap && <span className="flex items-center gap-1.5 text-xs text-white/50"><StatusChip status={cap.status} /> {cap.label}</span>}
      </div>
    </div>
  );
}

function Panel({ i }: { i: number }) {
  const s = STEPS[i]!;
  return (
    <div className="glass relative h-[560px] overflow-hidden rounded-[28px]">
      <div className="text-field pointer-events-none absolute inset-0" />
      <Banker pose={s.pose} className="pointer-events-none absolute -left-20 bottom-[-40px] h-[450px] w-auto max-w-none" />
      <div key={`b-${s.id}`} className="step-in absolute left-5 top-5 max-w-[250px]"><SpeechBubble>{s.say}</SpeechBubble></div>
      <div key={`c-${s.id}`} className="step-in glass absolute bottom-6 right-6 top-28 w-[54%] overflow-hidden rounded-2xl p-4"><s.Card /></div>
    </div>
  );
}

export function Showcase() {
  const pin = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [step, setStep] = useState(0);

  // Pin only on wide screens with motion allowed; otherwise render the stacked list.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setPinned(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!pinned || !pin.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: pin.current, start: "top top", end: `+=${N * 75}%`, pin: true, scrub: true, anticipatePin: 1,
      onUpdate: (self) => { const i = Math.min(N - 1, Math.floor(self.progress * N)); setStep((p) => (p === i ? p : i)); },
    });
    return () => { st.kill(); setStep(0); };
  }, [pinned]);

  const heading = (
    <h2 className="h-display text-5xl md:text-6xl">You ask.<br /><span className="grad">He verifies first.</span></h2>
  );

  if (!pinned) {
    return (
      <section id="introduction" className="mx-auto max-w-3xl px-5 py-24">
        {heading}
        <div className="mt-14 space-y-16">
          {STEPS.map((s, i) => (
            <article key={s.id}>
              <StepText i={i} />
              <div className="glass mt-6 rounded-2xl p-4"><s.Card /></div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="introduction">
      <div ref={pin} className="mx-auto grid h-screen max-w-6xl grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-center gap-12 px-5 pt-16">
        <div>
          {heading}
          <div className="mt-8"><Wheel step={step} /></div>
          <div className="mt-8 min-h-[170px]" aria-live="polite"><StepText i={step} /></div>
        </div>
        <Panel i={step} />
      </div>
    </section>
  );
}
