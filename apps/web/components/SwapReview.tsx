"use client";
import { useMemo, useState } from "react";
import { findAsset } from "@vetto/asset-registry";
import { formatUnits, type Intent } from "@vetto/intent-parser";
import type { QuoteResult, RouteQuote } from "@vetto/quote-engine";
import { formatAmount } from "@/lib/format";
import { getConnectedWallet } from "@/lib/walletconnect-provider";

/**
 * Route review panel.
 *
 * Two hard stops before anything is signed:
 *   1. the server must simulate the exact payload from this wallet,
 *   2. the person must tick an explicit confirmation of destination + approval scope.
 *
 * The wallet then signs the byte-identical payload the server built, and the
 * payload hash it returns must match — otherwise the submission is refused.
 */

type Prepared = {
  status: "prepared";
  executionId: string;
  wallet: string;
  venue: { id: string; label: string };
  transaction: { to: string; data: string; value: string; deadline: string };
  payloadHash: string;
  quoteFingerprint: string;
  simulation: {
    expectedOutBaseUnits?: string;
    minOutBaseUnits?: string;
    estimatedGas?: string;
    gasPriceWei?: string;
    allowance?: {
      permit2Allowance?: string;
      tokenToPermit2Allowance?: string;
      required: string;
      satisfied: boolean;
    } | null;
    quoteBlockNumber?: string;
  };
};

type ExecutionView = {
  id: string;
  status: "prepared" | "submitted" | "confirmed" | "reverted" | "expired";
  txHash: string | null;
  minOutBaseUnits: string;
  expectedOutBaseUnits: string;
  gasUsed: string | null;
  note?: string | null;
};

interface Props {
  intent: Extract<Intent, { kind: "swap" }>;
  quote: QuoteResult | undefined;
  label: string | undefined;
  selectedPath: string | null;
  onSelectPath: (executionPathId: string) => void;
  onRecorded?: () => void;
}

const short = (value: string, head = 6, tail = 4) =>
  value.length <= head + tail + 2 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

function Row({ k, v, dim, mono }: { k: string; v: string; dim?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-white/[.06] py-[7px] text-[12.5px]">
      <dt className="text-white/45">{k}</dt>
      <dd className={`${dim ? "text-white/35" : "text-white/85"} ${mono ? "font-mono text-[11px]" : ""} text-right`}>
        {v}
      </dd>
    </div>
  );
}

/**
 * Display amounts are truncated (never rounded up) so a long 18-decimal tail cannot
 * overflow the panel or overstate a "receive at least" figure. Base units remain the
 * only thing the payload carries.
 */
function amount(
  value: string | undefined,
  symbol: string | undefined,
  decimals: number | undefined,
  maxFraction = 6,
) {
  if (!value || !symbol || decimals === undefined) return "—";
  try {
    return `${formatAmount(BigInt(value), decimals, maxFraction)} ${symbol}`;
  } catch {
    return "—";
  }
}

export function SwapReview({ intent, quote, label, selectedPath, onSelectPath, onRecorded }: Props) {
  const out = findAsset(intent.tokenOut);
  const tin = findAsset(intent.tokenIn);

  const routes = quote?.routes ?? [];
  const selected: RouteQuote | undefined = useMemo(() => {
    if (!routes.length) return undefined;
    return routes.find((route) => route.executionPathId === selectedPath) ?? routes[0];
  }, [routes, selectedPath]);

  const [busy, setBusy] = useState<"preparing" | "signing" | "recording" | null>(null);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [execution, setExecution] = useState<ExecutionView | null>(null);
  const [confirmedReview, setConfirmedReview] = useState(false);

  const index = selected ? routes.findIndex((route) => route.quoteId === selected.quoteId) + 1 : 0;
  const bestOut = routes.reduce<bigint>((max, route) => {
    const value = BigInt(route.expectedOutBaseUnits);
    return value > max ? value : max;
  }, 0n);
  const isBest = selected ? BigInt(selected.expectedOutBaseUnits) === bestOut : false;

  const gasText =
    selected?.gasCostWei && selected.gasUnits
      ? `${formatAmount(BigInt(selected.gasCostWei), 18, 8)} ETH`
      : "Unavailable";

  const impactText =
    selected?.priceImpactBps !== undefined
      ? `${(selected.priceImpactBps / 100).toFixed(2)}%`
      : "Unavailable";

  const poolFeeText =
    selected?.venueFeeBps !== undefined
      ? `${(selected.venueFeeBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`
      : "Unavailable";

  async function prepare() {
    if (!selected || busy) return;
    setBusy("preparing");
    setError("");
    setPrepared(null);
    setExecution(null);
    setConfirmedReview(false);

    try {
      const response = await fetch("/api/execute/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          intent,
          venueId: selected.executionPathId,
          quoteFingerprint: selected.quoteFingerprint,
          reviewedMinOutBaseUnits: selected.minOutBaseUnits,
        }),
      });

      const body = (await response.json()) as Prepared & {
        error?: string;
        code?: string;
        simulation?: { reason?: string };
      };

      if (!response.ok || body.status !== "prepared") {
        setError(body.error ?? body.simulation?.reason ?? "Simulation did not pass.");
        return;
      }

      setPrepared(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preparation failed. Nothing was sent.");
    } finally {
      setBusy(null);
    }
  }

  async function signAndSend() {
    if (!prepared || busy || !confirmedReview) return;
    setBusy("signing");
    setError("");

    try {
      const { provider, address } = await getConnectedWallet();

      if (address.toLowerCase() !== prepared.wallet.toLowerCase()) {
        throw new Error(
          `Connect the wallet that was simulated (${short(prepared.wallet)}) — the payload was built for it.`,
        );
      }

      const hash = await provider.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: prepared.transaction.to,
            data: prepared.transaction.data,
            value: `0x${BigInt(prepared.transaction.value).toString(16)}`,
          },
        ],
      });

      if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
        throw new Error("The wallet did not return a transaction hash.");
      }

      setBusy("recording");

      const recorded = await fetch(`/api/executions/${prepared.executionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, payloadHash: prepared.payloadHash }),
      });

      const recordedBody = (await recorded.json()) as { execution?: ExecutionView; note?: string; error?: string };

      if (!recorded.ok || !recordedBody.execution) {
        throw new Error(
          `${recordedBody.error ?? "The transaction was submitted but could not be recorded."} Hash: ${hash}`,
        );
      }

      setExecution({ ...recordedBody.execution, note: recordedBody.note });
      onRecorded?.();
      await waitForReceipt(prepared.executionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet step failed. Nothing was sent.");
    } finally {
      setBusy(null);
    }
  }

  async function waitForReceipt(executionId: string) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 180_000) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const response = await fetch(`/api/executions/${executionId}`, { cache: "no-store" });
        const body = (await response.json()) as { execution?: ExecutionView; note?: string };
        if (body.execution) {
          setExecution({ ...body.execution, note: body.note });
          if (body.execution.status === "confirmed" || body.execution.status === "reverted") {
            onRecorded?.();
            return;
          }
        }
      } catch {
        /* keep polling until the timeout */
      }
    }
    setExecution((current) =>
      current
        ? { ...current, note: "Still waiting for a receipt. Nothing is claimed until the chain confirms." }
        : current,
    );
  }

  const executable = Boolean(selected?.isExecutable);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h2 className="text-[11px] text-white/40">Route review</h2>

      {!selected ? (
        <div className="mt-3 rounded-2xl border border-white/[.08] bg-white/[.03] p-4 text-[12.5px] leading-relaxed text-white/55">
          {quote ? quote.message : "Ask for a swap and the live routes land here — amount received, minimum, fees and what the wallet will be asked to approve."}
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[20px] border border-white/[.09] bg-[#120e2f]/85 p-4 shadow-[0_24px_60px_rgba(4,2,18,.45)]">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
            <span>
              Route {index} of {routes.length}
            </span>
            {isBest && <span className="badge badge-best">Best output</span>}
            {selected.venueFeeBps !== undefined && (
              <span className="badge badge-fee">{(selected.venueFeeBps / 100).toFixed(2).replace(/\.?0+$/, "")}% pool</span>
            )}
          </div>

          <h3 className="mt-2.5 text-[16px] font-semibold leading-tight text-white">
            {selected.provider.replace("Uniswap v4 · ", "Uniswap v4 ")}
          </h3>

          <p className="mt-3 text-[11px] text-white/45">You receive at least</p>
          <p className="mt-0.5 text-[31px] font-semibold leading-none tracking-tight text-white">
            {amount(selected.minOutBaseUnits, out?.symbol, out?.decimals).replace(` ${out?.symbol}`, "")}
            <span className="ml-1.5 text-[13px] font-medium text-white/55">{out?.symbol}</span>
          </p>
          <p className="mt-1 text-[10.5px] text-white/35">
            quoted {amount(selected.expectedOutBaseUnits, out?.symbol, out?.decimals)} before slippage
          </p>

          <dl className="mt-3">
            <Row k="You send" v={`${intent.amountIn} ${intent.tokenIn}`} />
            <Row
              k={`Minimum at ${((intent.slippageBps ?? 50) / 100).toFixed(2)}% slippage`}
              v={amount(selected.minOutBaseUnits, out?.symbol, out?.decimals)}
            />
            <Row k="Pool fee" v={poolFeeText} dim={selected.venueFeeBps === undefined} />
            <Row k="Price impact" v={impactText} dim={selected.priceImpactBps === undefined} />
            <Row k="Network fee (gas)" v={gasText} dim={!selected.gasCostWei} />
            <Row k="Network" v="Robinhood Chain · 4663" />
            <Row k="Via" v={`Uniswap v4 · ${routes.length > 0 ? "1 pool" : "—"}`} />
            <Row k="Visibility" v="Public mempool" />
            <Row
              k="Quote valid until"
              v={new Date(selected.executableUntil).toLocaleTimeString()}
              dim={false}
            />
          </dl>

          <p className="mt-3 border-t border-white/[.06] pt-2.5 text-[10.5px] leading-relaxed text-white/40">
            One v4 pool fills this order. Ranked by what actually lands in your wallet after the pool fee and gas.
          </p>

          {prepared && (
            <div className="mt-3 rounded-xl border border-lilac/30 bg-lilac/[.07] p-3 text-[11.5px] leading-relaxed text-white/75">
              <p className="mb-1 font-semibold text-white">Simulation passed</p>
              <p>
                Fresh quote at block {prepared.simulation.quoteBlockNumber} still clears your reviewed minimum of{" "}
                <strong>{amount(prepared.simulation.minOutBaseUnits, out?.symbol, out?.decimals)}</strong>.
              </p>
              <p className="mt-1">
                To <span className="font-mono">{short(prepared.transaction.to)}</span> · value{" "}
                {formatAmount(BigInt(prepared.transaction.value), 18, 8)} ETH
              </p>
              <p className="mt-1">
                Approval scope:{" "}
                {prepared.simulation.allowance
                  ? prepared.simulation.allowance.satisfied
                    ? `Permit2 allowance covers the exact ${prepared.simulation.allowance.required} base units`
                    : "Permit2 allowance insufficient — the swap would revert"
                  : "native ETH input — no token approval"}
              </p>
              <p className="mt-1 break-all text-white/40">payload {prepared.payloadHash.slice(0, 16)}…</p>
            </div>
          )}

          {execution && (
            <div
              className={`mt-3 rounded-xl border p-3 text-[11.5px] leading-relaxed ${
                execution.status === "confirmed"
                  ? "border-mint/40 bg-mint/[.08] text-white/85"
                  : execution.status === "reverted"
                    ? "border-coral/40 bg-coral/[.08] text-white/85"
                    : "border-white/15 bg-white/[.04] text-white/70"
              }`}
            >
              <p className="mb-1 font-semibold capitalize text-white">Transaction {execution.status}</p>
              <p>
                {execution.status === "confirmed"
                  ? `Confirmed on chain — received at least ${amount(execution.minOutBaseUnits, out?.symbol, out?.decimals)}.`
                  : execution.status === "reverted"
                    ? "Reverted on chain. No swap output was received."
                    : "Submitted. Status waits for a chain receipt."}
              </p>
              {execution.gasUsed && <p className="mt-1 text-white/50">Gas used: {execution.gasUsed}</p>}
              {execution.txHash && (
                <a
                  className="mt-1.5 inline-block underline"
                  href={`https://robinhoodchain.blockscout.com/tx/${execution.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on explorer ↗
                </a>
              )}
              {execution.note && <p className="mt-1 text-white/45">{execution.note}</p>}
            </div>
          )}

          {error && (
            <p role="status" aria-live="polite" className="mt-3 break-words text-[11.5px] leading-relaxed text-coral">
              {error}
            </p>
          )}

          <div className="mt-4">
            {!prepared && (
              <button
                type="button"
                onClick={() => void prepare()}
                disabled={busy !== null}
                className="btn btn-primary w-full shadow-[0_14px_34px_rgba(201,182,255,.22)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "preparing" ? "Simulating…" : "Simulate & review"}
              </button>
            )}

            {prepared && !execution?.txHash && (
              <>
                <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-white/65">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirmedReview}
                    onChange={(event) => setConfirmedReview(event.target.checked)}
                  />
                  I checked the amount, the destination router and the approval scope.
                </label>
                <button
                  type="button"
                  onClick={() => void signAndSend()}
                  disabled={busy !== null || !confirmedReview || !executable}
                  className="btn btn-primary mt-2.5 w-full shadow-[0_14px_34px_rgba(201,182,255,.22)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "signing" ? "Waiting for wallet…" : busy === "recording" ? "Registering…" : "Execute swap"}
                </button>
              </>
            )}

            {!executable && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-white/35">
                Quoted live, but signing is switched off in this deployment (
                <span className="font-mono">VETTO_SWAP_EXECUTION</span> not enabled).
              </p>
            )}
          </div>
        </div>
      )}

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
        {label ? `${label} · ` : ""}
        {tin && out ? `${tin.symbol} → ${out.symbol} · ` : ""}quotes are live from Uniswap v4 on Robinhood Chain. Your
        wallet shows the final approval; VETTO never signs for you.
      </p>
    </div>
  );
}
