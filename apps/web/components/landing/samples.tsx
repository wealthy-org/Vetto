import { IconCheck, IconKey, IconLock, IconSwap } from "../icons";

/** Illustrations only. Every figure here is sample data and is labelled as such — the product never shows a quote it can't execute. */
const Caption = () => <p className="mt-3 text-[10.5px] text-white/40">Illustration with sample numbers, not a live quote.</p>;

export function SampleRoute() {
  const rows = [
    { n: "Split route", s: "2 pools · ~8s", v: "0.7311", best: true },
    { n: "Intent solver", s: "solver auction · ~20s", v: "0.7306" },
    { n: "Direct pool", s: "1 pool · ~4s", v: "0.7289" },
  ];
  return (
    <div className="text-[12px]">
      <div className="mb-3 flex items-center justify-between text-white/50"><span>Route review</span><span className="chip !py-0.5">Private · off</span></div>
      <div className="mb-3 flex items-end justify-between"><div><div className="text-white/45">You pay</div><div className="text-xl font-semibold">2,500 <span className="text-white/60">USDG</span></div></div><div className="text-right"><div className="text-white/45">You get</div><div className="text-xl font-semibold">ETH</div></div></div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.n} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${r.best ? "border-mint/50 bg-mint/10" : "border-white/8 bg-white/[.03]"}`}>
            <IconSwap className="h-4 w-4 text-lilac" />
            <div className="flex-1"><div className="font-medium">{r.n}</div><div className="text-[10.5px] text-white/45">{r.s}</div></div>
            <div className="text-right font-semibold">{r.v} <span className="text-white/45">ETH</span>{r.best && <span className="ml-2 rounded bg-mint px-1.5 py-0.5 text-[9px] font-bold text-ink">Best</span>}</div>
          </li>
        ))}
      </ul>
      <button type="button" disabled className="btn btn-primary mt-3 w-full opacity-90">Review swap</button>
      <Caption />
    </div>
  );
}

export function SamplePrivate() {
  return (
    <div className="text-[12px]">
      <div className="mb-3 flex items-center justify-between text-white/50"><span>Submission</span>
        <span className="chip !py-0.5 text-peach"><IconLock className="h-3 w-3" /> Private requested</span></div>
      <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
        <div className="mb-2 flex items-center justify-between"><span className="font-medium">Relay check</span><span className="status status-unavailable">Unavailable</span></div>
        <p className="text-white/60">No verified private relay is connected for this chain, so the switch stays off. Public routes are never relabelled as private.</p>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10.5px] text-white/55">
        {["Your order", "Private relay", "Chain"].map((t, i) => (<li key={t} className={`rounded-lg border px-2 py-2 ${i === 1 ? "border-dashed border-white/20 text-white/35" : "border-white/10"}`}>{t}</li>))}
      </ol>
      <p className="mt-3 text-white/45">Even when available: after confirmation, amounts and wallets are public on the explorer.</p>
    </div>
  );
}

export function SampleCheck() {
  return (
    <div className="text-[12px]">
      <div className="mb-3 flex items-center gap-2 text-white/50"><span className="flex gap-1"><i className="h-2 w-2 rounded-full bg-white/20" /><i className="h-2 w-2 rounded-full bg-white/20" /></span> fastclaim-hood.xyz <span className="status status-planned ml-auto">Sandboxed</span></div>
      <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
        <div className="text-base font-semibold">Claim your rewards</div>
        <div className="mt-2 rounded-lg border border-coral/30 bg-coral/10 p-2.5">
          <div className="text-[10.5px] text-white/50">Signature request</div>
          <div className="mt-1 flex justify-between"><span className="text-white/60">Approve</span><span className="font-medium text-coral">All tokens, unlimited</span></div>
          <div className="flex justify-between"><span className="text-white/60">Spender</span><span className="font-mono text-white/80">0x9f3a…c71e</span></div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {[["ok", "Throwaway test wallet connected"], ["bad", "Asks to approve every token, no limit"], ["bad", "Spender contract is not verified"]].map(([k, t]) => (
          <li key={t} className="flex items-center gap-2"><span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${k === "ok" ? "bg-mint/20 text-mint" : "bg-coral/20 text-coral"}`}>{k === "ok" ? "✓" : "!"}</span><span className="text-white/75">{t}</span></li>
        ))}
      </ul>
      <Caption />
    </div>
  );
}

export function SampleTask() {
  const steps = ["Opened the site on a sealed machine", "Connected with the burner wallet", "Dry run: +1 NFT for 0.002 ETH", "Minted and sent to the burner"];
  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-center justify-between text-white/50"><span>Task run</span><span className="status status-planned">Planned feature</span></div>
      <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-2.5">
        <IconKey className="h-4 w-4 text-peach" /><div className="flex-1"><div className="font-medium">Your burner</div><div className="font-mono text-[10.5px] text-white/50">0x3b9d…e21c</div></div><span className="chip !py-0.5">Not your main wallet</span>
      </div>
      <ul className="space-y-2">{steps.map((s) => (<li key={s} className="flex items-center gap-2.5"><span className="grid h-4 w-4 place-items-center rounded-full bg-mint/20 text-mint"><IconCheck className="h-2.5 w-2.5" /></span><span className="text-white/80">{s}</span></li>))}</ul>
      <p className="mt-3 text-white/45">Spend cap and target contract are fixed before you approve.</p>
    </div>
  );
}

export function SampleLive() {
  return (
    <div className="text-[12px]">
      <div className="mb-2 flex items-center gap-2"><span className="status status-unavailable !bg-coral/20">● Live</span><span className="text-white/60">demo-dex.app</span><span className="chip ml-auto !py-0.5">Frankfurt</span></div>
      <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
        <div className="mb-2 flex justify-between rounded-lg bg-white/[.05] px-2.5 py-2"><span className="text-white/50">From</span><span className="font-medium">10 USDG</span></div>
        <div className="mb-2 flex justify-between rounded-lg bg-white/[.05] px-2.5 py-2"><span className="text-white/50">To</span><span className="font-medium">0.0029 ETH</span></div>
        <div className="rounded-lg bg-mint/90 py-2 text-center font-semibold text-ink">Review swap</div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-white/70"><span className="h-2 w-2 rounded-full bg-mint pulse-soft" /> Read-only. Take the controls whenever you like.</div>
      <div className="mt-3 flex gap-2"><span className="btn btn-ghost !py-1.5 text-xs">Take control</span><span className="btn btn-ghost !py-1.5 text-xs">End and wipe</span></div>
    </div>
  );
}
