"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Banker } from "../Banker";
import { IconKey, IconLock } from "../icons";

type VaultState = "sealed" | "checking" | "blocked" | "checked";
const COLORS: Record<VaultState, string> = { sealed: "#9a7bf2", checking: "#9a7bf2", blocked: "#ff6f7d", checked: "#7ee2a8" };
const LABEL: Record<VaultState, string> = { sealed: "Sealed", checking: "Checking", blocked: "Blocked", checked: "Checked" };

// One pass through the vault, driven by scroll progress (0..1). Sample requests only, see the caption below.
const SCRIPT: { from: number; state: VaultState; say: string; blockedCard: boolean; passedCard: boolean }[] = [
  { from: 0, state: "sealed", say: "Two sites, two requests. Neither one goes straight to your wallet.", blockedCard: false, passedCard: false },
  { from: 0.1, state: "checking", say: "A site is asking for something. Reading the request…", blockedCard: false, passedCard: false },
  { from: 0.38, state: "blocked", say: "That one wants every token you own, with no limit. It stays in the vault.", blockedCard: true, passedCard: false },
  { from: 0.52, state: "checking", say: "This one asks for exactly 10 USDG. Checking it on a chain copy now.", blockedCard: true, passedCard: false },
  { from: 0.74, state: "checked", say: "Clean. It’s yours to confirm, or not.", blockedCard: true, passedCard: true },
];
const stageAt = (p: number) => SCRIPT.reduce((acc, s, i) => (p >= s.from ? i : acc), 0);
const clamp = (v: number) => Math.max(0, Math.min(1, v));

// Request routes in the vault's 420x420 space (the ring sits at r≈100 around 210,210).
const BAD_IN = "M296 -18C352 30 340 96 283 135";
const GOOD_IN = "M312 -18C380 50 330 90 255 114";
const GOOD_OUT = "M283 282C322 312 352 336 378 380";

type Route = { path: SVGPathElement | null; trail: SVGPathElement | null; head: SVGGElement | null; pill: SVGGElement | null };

/** Draws a route up to t (0..1): fading trail, arrow head and request pill riding the tip. */
function drawRoute(r: Route, t: number, opts: { pill?: boolean; fade?: number } = {}) {
  const { path, trail, head, pill } = r;
  if (!path || !trail || !head) return;
  const len = path.getTotalLength();
  const at = len * t;
  const tail = Math.min(at, len * 0.6);
  trail.setAttribute("stroke-dasharray", `${tail} ${len + 10}`);
  trail.setAttribute("stroke-dashoffset", `${-(at - tail)}`);
  const pt = path.getPointAtLength(at);
  const back = path.getPointAtLength(Math.max(0, at - 2));
  const angle = (Math.atan2(pt.y - back.y, pt.x - back.x) * 180) / Math.PI;
  head.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
  const vis = t <= 0 ? 0 : (opts.fade ?? 1);
  trail.style.opacity = String(vis);
  head.style.opacity = String(vis);
  if (pill) {
    const lead = path.getPointAtLength(Math.max(0, at - len * 0.18));
    pill.setAttribute("transform", `translate(${lead.x.toFixed(1)} ${(lead.y - 16).toFixed(1)})`);
    pill.style.opacity = String(opts.pill === false ? 0 : vis);
  }
}

function Vault({ state, refs }: { state: VaultState; refs: React.MutableRefObject<Record<string, SVGElement | null>> }) {
  const c = COLORS[state];
  const set = (k: string) => (el: SVGElement | null) => { refs.current[k] = el; };
  const arcs = [0, 1, 2, 3].map((k) => {
    const a0 = (k * 90 + 14) * (Math.PI / 180);
    const a1 = (k * 90 + 76) * (Math.PI / 180);
    const p = (a: number) => `${(210 + Math.cos(a) * 100).toFixed(1)} ${(210 + Math.sin(a) * 100).toFixed(1)}`;
    return `M${p(a0)}A100 100 0 0 1 ${p(a1)}`;
  });
  const Arrowhead = () => <path d="M-7 -5 3 0-7 5Z" />;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(400px,42vh)] overflow-visible" role="img" aria-label={`Vault status: ${LABEL[state]}`}>
      <svg viewBox="0 0 420 420" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <path id="vault-text" d="M210 210m-128 0a128 128 0 1 1 256 0a128 128 0 1 1-256 0" />
          <radialGradient id="vault-glow"><stop stopColor="#5b34d6" stopOpacity=".45" /><stop offset="1" stopColor="#5b34d6" stopOpacity="0" /></radialGradient>
        </defs>
        <circle cx="210" cy="210" r="214" fill="none" stroke="rgba(201,182,255,.22)" strokeDasharray="2 7" />
        <circle cx="210" cy="210" r="160" fill="url(#vault-glow)" />
        <circle cx="210" cy="210" r="146" fill="none" stroke="rgba(201,182,255,.3)" strokeWidth="9" strokeDasharray="1 5" />
        <g style={{ transformOrigin: "210px 210px" }} className="ring-spin-slow">
          <text fontSize="10" letterSpacing="4" fill="rgba(201,182,255,.55)" fontWeight="600"><textPath href="#vault-text">{"vetto · 0110 · ".repeat(9)}</textPath></text>
        </g>
        <g style={{ transformOrigin: "210px 210px" }} className={state === "checking" ? "vault-orbit" : ""}>
          {arcs.map((d, k) => <path key={k} d={d} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" style={{ transition: "stroke .5s" }} />)}
        </g>
        <circle cx="210" cy="210" r="66" fill="rgba(12,9,37,.92)" stroke="rgba(255,255,255,.1)" />

        {/* request routes (positions are set from scroll progress) */}
        <g ref={set("badG")} style={{ color: "#ff6f7d" }}>
          <path ref={set("badPath")} d={BAD_IN} fill="none" stroke="none" />
          <path ref={set("badTrail")} d={BAD_IN} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0" />
          <g ref={set("badHead")} fill="currentColor" opacity="0"><Arrowhead /></g>
          <g ref={set("badPill")} opacity="0"><rect x="-62" y="-11" width="124" height="22" rx="11" fill="rgba(60,14,30,.92)" stroke="currentColor" strokeOpacity=".7" /><text textAnchor="middle" y="4" fontSize="10.5" fontWeight="600" fill="#ffb3bb">Approve all tokens</text></g>
        </g>
        <g ref={set("goodG")} style={{ color: "#7ee2a8" }}>
          <path ref={set("goodInPath")} d={GOOD_IN} fill="none" stroke="none" />
          <path ref={set("goodInTrail")} d={GOOD_IN} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0" />
          <g ref={set("goodInHead")} fill="currentColor" opacity="0"><Arrowhead /></g>
          <g ref={set("goodPill")} opacity="0"><rect x="-76" y="-11" width="152" height="22" rx="11" fill="rgba(10,44,34,.92)" stroke="currentColor" strokeOpacity=".7" /><text textAnchor="middle" y="4" fontSize="10.5" fontWeight="600" fill="#b9f3d2">Exact approval · 10 USDG</text></g>
          <path ref={set("goodOutPath")} d={GOOD_OUT} fill="none" stroke="none" />
          <path ref={set("goodOutTrail")} d={GOOD_OUT} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0" />
          <g ref={set("goodOutHead")} fill="currentColor" opacity="0"><Arrowhead /></g>
        </g>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-2">
          <span className="block h-[74px] w-[74px] overflow-hidden rounded-full bg-[#3a2c88]/60"><Banker eyes={false} fade={false} viewBox="120 40 296 270" className="h-full w-full" /></span>
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-ink transition-colors duration-500" style={{ background: c }}>{LABEL[state]}</span>
        </div>
      </div>
    </div>
  );
}

function RequestCard({ tone, title, rows, children }: { tone: "bad" | "ok"; title: string; rows: [string, string][]; children?: React.ReactNode }) {
  return (
    <div className={`step-in glass rounded-2xl p-4 text-[12px] ${tone === "bad" ? "border-coral/30" : "border-mint/30"}`} style={{ borderColor: tone === "bad" ? "rgba(255,111,125,.35)" : "rgba(126,226,168,.35)" }}>
      <div className={`mb-1 text-[11px] font-medium ${tone === "bad" ? "text-coral" : "text-mint"}`}>{tone === "bad" ? "Stopped in the vault" : "Passed to you"}</div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {rows.map(([k, v]) => (<div key={k} className="flex justify-between border-t border-white/5 py-1"><span className="text-white/45">{k}</span><span className="text-white/80">{v}</span></div>))}
      {children}
    </div>
  );
}

export function HoldToConfirm() {
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(0);
  const t0 = useRef(0);
  const HOLD = 1200;

  const stop = () => { cancelAnimationFrame(raf.current); if (!done) setP(0); };
  const tick = (now: number) => {
    const v = Math.min(1, (now - t0.current) / HOLD);
    setP(v);
    if (v >= 1) { setDone(true); window.setTimeout(() => { setDone(false); setP(0); }, 2600); return; }
    raf.current = requestAnimationFrame(tick);
  };
  const start = () => { if (done) return; t0.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div>
      <button type="button" aria-label="Hold to confirm (demo)"
        onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); start(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") stop(); }}
        className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-left text-sm font-semibold select-none touch-none">
        <span className="absolute inset-y-0 left-0 bg-gradient-to-r from-lilac/40 to-peach/40" style={{ width: `${p * 100}%` }} />
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/10"><IconLock className="h-4 w-4" /></span>
        <span className="relative">{done ? "Confirmed (demo only)" : "Hold to confirm"}</span>
      </button>
      <p className="mt-2 text-xs text-white/45">Nothing runs without your confirmation. This button is a demo and signs nothing.</p>
    </div>
  );
}


function MoreCards() {
  const [on, setOn] = useState(false);
  return (
      <div className="mt-16 grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h3 className="font-semibold">Replayed before you sign</h3>
          <p className="mt-1 text-sm text-white/55">Every transaction is simulated on a copy of the chain, and the result is shown to you first.</p>
          <dl className="mt-4 space-y-2 rounded-2xl bg-white/[.03] p-4 text-sm">
            {[["You send", "2,500 USDG"], ["You receive", "≥ 0.7274 ETH"], ["Approval", "Exact, 2,500 USDG"]].map(([k, v]) => (<div key={k} className="flex justify-between"><dt className="text-white/50">{k}</dt><dd className="font-medium">{v}</dd></div>))}
          </dl>
        </div>
        <div className="glass relative overflow-hidden rounded-3xl p-6">
          <h3 className="font-semibold">Your main wallet stays home</h3>
          <p className="mt-1 text-sm text-white/55">Tasks use a burner you fund with a fixed amount. Worst case, you lose that amount.</p>
          <div className="relative mt-5 h-28">
            <div className="absolute left-0 top-2 w-[58%] rounded-xl bg-gradient-to-br from-violet to-[#4a3aa8] p-3 text-xs shadow-lg"><div className="font-semibold">Main wallet</div><div className="font-mono opacity-70">0x57f0…365e</div><div className="mt-1 flex items-center gap-1 opacity-80"><IconLock className="h-3 w-3" /> Stays home</div></div>
            <div className="absolute right-0 top-9 w-[58%] rotate-[6deg] rounded-xl bg-gradient-to-br from-peach to-[#ff9a8a] p-3 text-xs text-ink shadow-lg"><div className="flex items-center gap-1 font-semibold"><IconKey className="h-3 w-3" /> Burner</div><div className="font-mono opacity-70">0x3b9d…e21c</div><div className="mt-1 opacity-80">Goes out · capped</div></div>
          </div>
        </div>
        <div className="glass rounded-3xl p-6">
          <h3 className="font-semibold">Private is your call</h3>
          <p className="mt-1 text-sm text-white/55">Off unless you say so, and only offered where a verified relay exists.</p>
          <button type="button" role="switch" aria-checked={on} onClick={() => setOn((v) => !v)} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm font-medium">
            Private submission
            <span className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-violet" : "bg-white/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span>
          </button>
          <p className="mt-3 min-h-[2.5rem] text-xs text-white/50">{on ? "Unavailable on this chain until a relay is verified. Your transaction would be public after confirmation anyway." : "Public submission. Visible on the explorer after confirmation."}</p>
        </div>
        <div className="glass rounded-3xl p-6"><h3 className="mb-1 font-semibold">You confirm</h3><p className="mb-5 text-sm text-white/55">Swaps, mints and claims all wait for you.</p><HoldToConfirm /></div>
      </div>
  );
}

export function Security() {
  const wrap = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, SVGElement | null>>({});
  const [pinned, setPinned] = useState(false);
  const [i, setI] = useState(SCRIPT.length - 1);
  const iRef = useRef(SCRIPT.length - 1);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setPinned(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const r = refs.current;
    const route = (a: string, b: string, c: string, d?: string): Route => ({
      path: r[a] as SVGPathElement | null, trail: r[b] as SVGPathElement | null, head: r[c] as SVGGElement | null, pill: d ? (r[d] as SVGGElement | null) : null,
    });
    const bad = route("badPath", "badTrail", "badHead", "badPill");
    const goodIn = route("goodInPath", "goodInTrail", "goodInHead", "goodPill");
    const goodOut = route("goodOutPath", "goodOutTrail", "goodOutHead");

    const apply = (p: number) => {
      const next = stageAt(p);
      if (next !== iRef.current) { iRef.current = next; setI(next); }
      const badT = clamp((p - 0.1) / 0.26);
      drawRoute(bad, badT, { fade: 1 - clamp((p - 0.4) / 0.1), pill: badT < 1 || p < 0.4 });
      const inT = clamp((p - 0.5) / 0.2);
      drawRoute(goodIn, inT, { fade: 1 - clamp((p - 0.74) / 0.08), pill: inT < 1 });
      drawRoute(goodOut, clamp((p - 0.76) / 0.2));
    };

    if (!pinned) { apply(1); return; }
    gsap.registerPlugin(ScrollTrigger);
    iRef.current = -1;
    apply(0);
    const st = ScrollTrigger.create({ trigger: wrap.current, start: "top top", end: "bottom bottom", scrub: 0.6, onUpdate: (self) => apply(self.progress) });
    return () => { st.kill(); iRef.current = SCRIPT.length - 1; setI(SCRIPT.length - 1); };
  }, [pinned]);

  const cur = SCRIPT[i]!;
  return (
    <section id="security" className="relative">
      <div ref={wrap} className={pinned ? "relative h-[340vh]" : "relative"}>
        <div className={`mx-auto max-w-6xl px-5 ${pinned ? "sticky top-0 flex h-screen flex-col justify-center pt-16" : "py-24"}`}>
          <div className="grid items-center gap-10 lg:grid-cols-[5fr_6fr]">
            <div>
              <p className="mb-3 text-sm text-lilac">Security</p>
              <h2 className="h-display text-5xl md:text-6xl">Your wallet stays <span className="grad">out of it.</span></h2>
              <p className="mt-5 max-w-md text-white/60">Every request goes through Vetto’s vault first. Anything that asks for more than the task needs is stopped there, and you get the reason.</p>
              <div className="mt-8 flex max-w-sm items-start gap-3">
                <span className="mt-1 block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#3a2c88]/60"><Banker eyes={false} fade={false} viewBox="120 40 296 270" className="h-full w-full" /></span>
                <div className="glass min-h-[64px] rounded-2xl rounded-tl-md px-4 py-3 text-[13px] leading-snug text-white/90" role="status" aria-live="polite"><span key={i} className="step-in block">{cur.say}</span></div>
              </div>
            </div>
            <div className="pt-14">
              <div className="glass relative mx-auto mb-2 w-fit rounded-xl px-3 py-2 text-[11px] text-white/55">
                <div className="mb-1.5">Sites you open</div>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1 text-white/80"><i className="h-1.5 w-1.5 rounded-full bg-coral" />claim-hood-rewards.xyz</span>
                  <span className="flex items-center gap-1.5 rounded-lg bg-white/[.05] px-2 py-1 text-white/80"><i className="h-1.5 w-1.5 rounded-full bg-mint" />example-dex.app</span>
                </div>
              </div>
              <Vault state={cur.state} refs={refs} />
            </div>
          </div>

          <div className="mx-auto mt-6 grid w-full max-w-3xl gap-4 sm:grid-cols-2" aria-live="polite">
            <div className="min-h-[150px]">{cur.blockedCard && <RequestCard tone="bad" title="Approve all tokens, unlimited" rows={[["Spender", "Not verified"], ["Domain", "4 days old"]]}><p className="mt-2 text-coral">Never reached your wallet.</p></RequestCard>}</div>
            <div className="min-h-[150px]">{cur.passedCard && <RequestCard tone="ok" title="Exact approval, 10 USDG" rows={[["Spender", "Verified router"], ["Dry run", "Moves 10 USDG only"]]}><div className="mt-3 flex gap-2"><span className="btn btn-primary !py-1.5 text-xs">Confirm</span><span className="btn btn-ghost !py-1.5 text-xs">Decline</span></div></RequestCard>}</div>
          </div>
          <p className="mt-2 text-center text-[11px] text-white/35">Sample requests for illustration. The sandboxed scan itself is a planned feature (see What’s live).</p>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-28"><MoreCards /></div>
    </section>
  );
}
