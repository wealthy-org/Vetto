import { CAPABILITIES } from "@vetto/quote-engine";
import { ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { StatusChip } from "../StatusChip";

export function Status() {
  return (
    <section id="status" className="mx-auto max-w-6xl px-5 py-28">
      <div className="grid gap-10 lg:grid-cols-[5fr_7fr]">
        <div>
          <h2 className="h-display text-5xl md:text-6xl">What’s live, <span className="grad">and what isn’t.</span></h2>
          <p className="mt-5 max-w-md text-white/60">Every capability carries a plain status. If a route, relay or scanner has no real integration yet, it says so instead of showing a made-up number.</p>
          <dl className="glass mt-8 space-y-3 rounded-2xl p-5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/50">Network</dt><dd className="text-right">Robinhood Chain</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/50">Chain ID</dt><dd className="text-right font-mono">{ROBINHOOD_CHAIN_ID} <span className="font-sans text-xs text-white/40">(from the project brief; verify before launch)</span></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/50">Token & fees</dt><dd className="text-right">Separate decision, not part of the MVP</dd></div>
          </dl>
        </div>
        <ul className="glass divide-y divide-white/5 overflow-hidden rounded-3xl">
          {CAPABILITIES.map((c) => (
            <li key={c.id} className="flex items-start gap-4 px-5 py-4">
              <div className="w-24 shrink-0 pt-0.5"><StatusChip status={c.status} /></div>
              <div><div className="text-sm font-medium">{c.label}</div><div className="mt-0.5 text-xs leading-relaxed text-white/50">{c.note}</div></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
