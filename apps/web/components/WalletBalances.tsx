"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";

interface WalletBalancesResponse {
  address: string;
  commonBlock: string;
  balances: { symbol: string; decimals: number; balanceBaseUnits: string }[];
  note: string;
}

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: WalletBalancesResponse };

function displayAmount(balance: WalletBalancesResponse["balances"][number]) {
  return formatUnits(BigInt(balance.balanceBaseUnits), balance.decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function WalletBalances() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState>({ kind: "idle" });

  useEffect(() => {
    const clearBalances = () => {
      setOpen(false);
      setState({ kind: "idle" });
    };
    window.addEventListener("vetto:session-ended", clearBalances);
    return () => window.removeEventListener("vetto:session-ended", clearBalances);
  }, []);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/balances", { cache: "no-store" });
      if (response.status === 401) {
        setState({ kind: "signed-out" });
        return;
      }
      const body = await response.json() as WalletBalancesResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Balance request failed (${response.status}).`);
      if (!Array.isArray(body.balances) || typeof body.commonBlock !== "string") {
        throw new Error("The balance response was invalid.");
      }
      setState({ kind: "ready", data: body });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Wallet balances are unavailable." });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        aria-controls="wallet-balances-panel"
        className="text-white/70 hover:text-white"
      >
        Balances
      </button>
      {open && (
        <section
          id="wallet-balances-panel"
          aria-label="Robinhood Chain wallet balances"
          className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-panel p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Robinhood Chain</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close balances" className="text-white/50 hover:text-white">×</button>
          </div>
          {state.kind === "idle" || state.kind === "loading" ? <p role="status" className="text-xs text-white/55">Checking balances across two RPCs…</p> : null}
          {state.kind === "signed-out" ? <p className="text-xs text-white/55">Sign in with a wallet to view its read-only balances.</p> : null}
          {state.kind === "error" ? <p role="alert" className="text-xs text-peach">{state.message}</p> : null}
          {state.kind === "ready" && (
            <>
              <dl className="space-y-2">
                {state.data.balances.map((balance) => (
                  <div key={balance.symbol} className="flex items-center justify-between rounded-xl bg-white/[.04] px-3 py-2">
                    <dt className="text-xs text-white/55">{balance.symbol}</dt>
                    <dd className="max-w-[70%] break-all text-right text-sm font-medium">{displayAmount(balance)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11px] text-white/45">Wallet: {state.data.address.slice(0, 6)}…{state.data.address.slice(-4)}</p>
              <p className="mt-1 text-[11px] text-white/45">As of block {state.data.commonBlock}</p>
              <p className="mt-2 text-[10px] leading-relaxed text-white/35">{state.data.note}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
