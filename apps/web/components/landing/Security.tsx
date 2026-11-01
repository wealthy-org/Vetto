"use client";
import { useEffect, useRef, useState } from "react";
import { Mark } from "../Logo";
import { SpeechBubble } from "../Banker";
import { IconKey, IconLock } from "../icons";

type VaultState = "checking" | "blocked" | "checked";
const COLORS: Record<VaultState, string> = { checking: "#9a7bf2", blocked: "#ff6f7d", checked: "#7ee2a8" };
const LABEL: Record<VaultState, string> = { checking: "Checking", blocked: "Blocked", checked: "Checked" };

// Timeline of one loop. Sample requests only — see caption in the section.
const SCRIPT: { at: number; state: VaultState; say: string; blockedCard: boolean; passedCard: boolean }[] = [
  { at: 0, state: "checking", say: "A site is asking for something. Reading the request…", blockedCard: false, passedCard: false },
  { at: 1500, state: "blocked", say: "That one wants every token you own, with no limit. It stays outside.", blockedCard: true, passedCard: false },
  { at: 4300, state: "checking", say: "This one asks for exactly 10 USDG. Replaying it on a copy of the chain…", blockedCard: true, passedCard: false },
  { at: 6200, state: "checked", say: "Clean: exact amount, verified spender. Confirming is up to you.", blockedCard: true, passedCard: true },
];
const LOOP_MS = 11000;

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setIn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setIn(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

function Vault({ state }: { state: VaultState }) {
  const c = COLORS[state];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]" role="img" aria-label={`Vault status: ${LABEL[state]}`}>
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full">
        <defs><path id="ringtext" d="M150 150m-124 0a124 124 0 1 1 248 0a124 124 0 1 1-248 0" /></defs>
        <circle cx="150" cy="150" r="146" fill="none" stroke="rgba(255,255,255,.05)" />
        <g style={{ transformOrigin: "150px 150px" }} className="ring-spin-slow">
          <text fontSize="9" letterSpacing="3.2" fill="rgba(201,182,255,.45)" fontWeight="600"><textPath href="#ringtext">{"VETTO · ".repeat(14)}</textPath></text>
        </g>
        <circle cx="150" cy="150" r="104" fill="none" stroke={c} strokeOpacity=".25" strokeWidth="3" style={{ transition: "stroke .5s" }} />
        <circle cx="150" cy="150" r="104" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeDasharray={state === "checking" ? "120 534" : "654 0"}
          className={state === "checking" ? "vault-orbit" : ""} style={{ transformOrigin: "150px 150px", transition: "stroke .5s, stroke-dasharray .6s" }} />
        <circle cx="150" cy="150" r="78" fill="rgba(12,9,37,.9)" stroke="rgba(255,255,255,.08)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-2"><Mark size={44} />
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-ink transition-colors duration-500" style={{ background: c }}>{LABEL[state]}</span></div>
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

export function Security() {
  const [ref, inView] = useInView<HTMLElement>();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setI(SCRIPT.length - 1); return; }
    const ids: number[] = [];
    const run = () => {
      setI(0);
      SCRIPT.forEach((s, idx) => ids.push(window.setTimeout(() => setI(idx), s.at)));
      ids.push(window.setTimeout(run, LOOP_MS));
    };
    run();
    return () => ids.forEach(clearTimeout);
  }, [inView]);

  const cur = SCRIPT[i]!;
  const [on, setOn] = useState(false);

  return (
    <section id="security" ref={ref} className="relative mx-auto max-w-6xl px-5 py-28">
      <div className="grid items-center gap-10 lg:grid-cols-[5fr_6fr]">
        <div>
          <h2 className="h-display text-5xl md:text-6xl">Nothing reaches your wallet <span className="grad">unchecked.</span></h2>
          <p className="mt-5 max-w-md text-white/60">Every request goes through the vault first. Anything asking for more than the task needs is stopped there, and you get the reason.</p>
          <div className="mt-8 max-w-sm"><SpeechBubble><span key={i} className="step-in block">{cur.say}</span></SpeechBubble></div>
        </div>
        <Vault state={cur.state} />
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2" aria-live="polite">
        <div className="min-h-[168px]">{cur.blockedCard && <RequestCard tone="bad" title="Approve all tokens, unlimited" rows={[["Spender", "Not verified"], ["Domain", "4 days old"]]}><p className="mt-2 text-coral">Never reached your wallet.</p></RequestCard>}</div>
        <div className="min-h-[168px]">{cur.passedCard && <RequestCard tone="ok" title="Exact approval, 10 USDG" rows={[["Spender", "Verified router"], ["Dry run", "Moves 10 USDG only"]]}><div className="mt-3 flex gap-2"><span className="btn btn-primary !py-1.5 text-xs">Confirm</span><span className="btn btn-ghost !py-1.5 text-xs">Decline</span></div></RequestCard>}</div>
      </div>
      <p className="mt-2 text-center text-[11px] text-white/35">Sample requests for illustration. The sandboxed scan itself is a planned feature (see What’s live).</p>

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
    </section>
  );
}
