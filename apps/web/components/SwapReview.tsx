"use client";
import { useMemo, useState } from "react";
import { MAINNET_EXPLORER, TxProofModal, type TxProof } from "./TxProofModal";
import { findAsset } from "@vetto/asset-registry";
import { formatUnits, type Intent } from "@vetto/intent-parser";
import type { QuoteResult, RouteQuote } from "@vetto/quote-engine";
import { formatAmount } from "@/lib/format";
import { isTestnetDeployment, networkLabel, TESTNET_DISCLOSURE } from "@/lib/chain-label";
import { resolveSendProvider } from "@/lib/execute-provider";
import { WALLET_NOT_LINKED_ON_THIS_CHAIN } from "@/lib/linked-wallet";

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
    /** False when only one RPC provider exists for this chain. */
    crossChecked?: boolean;
  };
};

type ApprovalStep = {
  purpose: "erc20-approve-permit2" | "permit2-approve-router";
  narration: string;
  to: string;
  data: string;
  value: string;
  call: { method: string; args: Record<string, string> };
};

type ApprovalPlan = {
  satisfied: boolean;
  snapshot: { owner: string; required: string; tokenToPermit2: string; permit2ToRouter: string };
  steps: ApprovalStep[];
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

/** Chain display comes from the server page so the review can never label a
 *  different chain than the one the API will simulate on. */
export interface ChainDisplay {
  label: string;
  short: string;
  testnet: boolean;
  explorer?: string;
}

interface Props {
  intent: Extract<Intent, { kind: "swap" }>;
  quote: QuoteResult | undefined;
  label: string | undefined;
  selectedPath: string | null;
  onSelectPath: (executionPathId: string) => void;
  onRecorded?: () => void;
  chain?: ChainDisplay;
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

export function SwapReview({
  intent,
  quote,
  label,
  selectedPath,
  onSelectPath,
  onRecorded,
  chain,
}: Props) {
  const chainView: ChainDisplay = chain ?? {
    label: networkLabel(),
    short: networkLabel(),
    testnet: isTestnetDeployment(),
  };
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
  /** True when prepare said the wallet is linked on another chain and needs a new sign-in. */
  const [relink, setRelink] = useState(false);
  const [execution, setExecution] = useState<ExecutionView | null>(null);
  const [confirmedReview, setConfirmedReview] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalStep[]>([]);
  const [approvalHashes, setApprovalHashes] = useState<string[]>([]);
  /** Wallet the approval plan was built for (there is no prepared swap yet at that point). */
  const [approvalOwner, setApprovalOwner] = useState("");
  const [proof, setProof] = useState<TxProof | null>(null);
  const explorer = chainView.explorer ?? MAINNET_EXPLORER;

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

  async function prepare(): Promise<"prepared" | "approval" | "failed"> {
    setRelink(false);
    if (!selected || busy) return "failed";
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
        approval?: ApprovalPlan;
      };

      if (!response.ok || body.status !== "prepared") {
        if (body.code === WALLET_NOT_LINKED_ON_THIS_CHAIN) {
          // Not a dead end: the session was created on the other chain. Offer the fix.
          setRelink(true);
          setError(body.error ?? "Sign in again on this chain, then retry.");
          return "failed";
        }

        if (body.code === "APPROVAL_REQUIRED" && body.approval?.steps?.length) {
          // Not a dead end: the wallet signs these separately, then we prepare again.
          setApprovals(body.approval.steps);
          setApprovalOwner(body.approval.snapshot.owner);
          setApprovalHashes([]);
          setError("");
          return "approval";
        }
        setError(body.error ?? body.simulation?.reason ?? "Simulation did not pass.");
        return "failed";
      }

      setApprovals([]);
      setPrepared(body);
      return "prepared";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preparation failed. Nothing was sent.");
      return "failed";
    } finally {
      setBusy(null);
    }
  }

  /**
   * Walks the wallet through the Permit2 approvals one at a time, then prepares the swap
   * again. Nothing is approximated: the calldata below was built server-side and is shown
   * to the user before each signature.
   */
  async function runApprovals() {
    if (!approvals.length || busy) return;
    setBusy("signing");
    setError("");
    const hashes: string[] = [];
    let walletProvider: Awaited<ReturnType<typeof resolveSendProvider>>["provider"] | null = null;

    try {
      // Use the wallet that was signed in with and holds this address — not an
      // unconditional WalletConnect modal.
      const { provider, address } = await resolveSendProvider(approvalOwner || prepared?.wallet || "");
      walletProvider = provider;

      for (const step of approvals) {
        const hash = await provider.request<string>({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: step.to,
              data: step.data,
              value: `0x${BigInt(step.value || "0").toString(16)}`,
            },
          ],
        });

        if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
          throw new Error("The wallet did not return a transaction hash for the approval.");
        }
        hashes.push(hash);
        setApprovalHashes([...hashes]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The approval was not sent.");
      setBusy(null);
      return;
    } finally {
      setBusy(null);
    }

    // Read each approval's receipt from the chain, then show the proof.
    if (walletProvider && hashes.length) {
      setBusy("recording");
      const receipts = await waitForApprovalReceipts(walletProvider, hashes);
      setBusy(null);
      if (receipts) {
        const reverted = receipts.some((r) => r.status !== "0x1");
        setProof({
          status: reverted ? "reverted" : "confirmed",
          title: reverted ? "Token approval reverted" : "Token approval confirmed",
          subtitle: reverted
            ? "The chain receipt shows a revert. The swap cannot run until the approval lands."
            : "Status read from the chain receipt. Next: simulate and execute the swap.",
          rows: [
            ["Token", `${intent.amountIn} ${intent.tokenIn}`],
            ["Approved for", "Permit2 → Uniswap Universal Router"],
            ["Network", chainView.label],
          ],
          txs: receipts.map((r, i) => ({
            label: approvals[i]?.purpose === "permit2-approve-router" ? "Permit2" : "Approve",
            hash: hashes[i]!,
            gasUsed: r.gasUsed ? BigInt(r.gasUsed).toString() : null,
          })),
          explorer,
        });
        if (reverted) return;
      }
    }

    // Approvals are on the way; ask the server to re-simulate until the chain agrees.
    setBusy("preparing");
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const outcome = await prepare();
        if (outcome !== "approval") break;
      }
    } finally {
      setBusy(null);
    }
  }

  /** Polls the wallet's RPC for each approval receipt (up to ~2 min). Null on timeout. */
  async function waitForApprovalReceipts(
    provider: { request<T>(args: { method: string; params?: unknown[] }): Promise<T> },
    hashes: string[],
  ): Promise<{ status: string; gasUsed?: string }[] | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120_000) {
      try {
        const receipts = await Promise.all(
          hashes.map((hash) =>
            provider.request<{ status: string; gasUsed?: string } | null>({
              method: "eth_getTransactionReceipt",
              params: [hash],
            }),
          ),
        );
        if (receipts.every(Boolean)) return receipts as { status: string; gasUsed?: string }[];
      } catch {
        /* keep polling */
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return null;
  }

  async function signAndSend() {
    if (!prepared || busy || !confirmedReview) return;
    setBusy("signing");
    setError("");

    try {
      const { provider, address } = await resolveSendProvider(prepared.wallet);

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
          const final = body.execution;
          if ((final.status === "confirmed" || final.status === "reverted") && final.txHash) {
            const ok = final.status === "confirmed";
            setProof({
              status: final.status,
              title: ok ? "Swap confirmed on Robinhood Chain" : "Swap reverted",
              subtitle: ok
                ? "Status read from the chain receipt, not from the app."
                : "The chain receipt shows a revert. No swap output was received.",
              rows: [
                ["You sent", `${intent.amountIn} ${intent.tokenIn}`],
                ...(ok ? [["Received at least", amount(final.minOutBaseUnits, out?.symbol, out?.decimals)] as [string, string]] : []),
                ["Network", chainView.label],
              ],
              txs: [{ label: "Swap", hash: final.txHash, gasUsed: final.gasUsed }],
              explorer,
            });
          }
          if (final.status === "confirmed" || final.status === "reverted") {
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
      <TxProofModal proof={proof} onClose={() => setProof(null)} />
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
            <Row k="Network" v={chainView.label} />
            {chainView.testnet && <Row k="Funds" v="Testnet only — no real value" />}
            <Row k="Via" v={`Uniswap v4 · ${routes.length > 0 ? "1 pool" : "—"}`} />
            <Row k="Visibility" v="Public mempool" />
            {/* Two providers agreeing is the mainnet claim. A chain with one operator
                must not borrow it, so the row says what actually happened. */}
            {prepared?.simulation.crossChecked === false && (
              <Row k="RPC cross-check" v="Single provider (this chain has one)" dim />
            )}
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
                  href={`${explorer}/tx/${execution.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on explorer ↗
                </a>
              )}
              {execution.note && <p className="mt-1 text-white/45">{execution.note}</p>}
            </div>
          )}

          {relink && (
            <button
              type="button"
              onClick={async () => {
                // Drop the old session, then sign in again: the challenge binds the
                // chain, so only a fresh signature can link this wallet to this chain.
                await fetch("/api/auth/logout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                });
                window.location.assign("/sign-in");
              }}
              className="mt-2 w-full rounded-xl border border-lilac/40 bg-lilac/10 px-3 py-2.5 text-xs font-medium text-white hover:bg-lilac/20"
            >
              Sign out and sign in again on this chain
            </button>
          )}

      {error && (
            <p role="status" aria-live="polite" className="mt-3 break-words text-[11.5px] leading-relaxed text-coral">
              {error}
            </p>
          )}

          <div className="mt-4">
            {approvals.length > 0 && !prepared && (
              <div className="mb-3 rounded-2xl border border-amber-300/25 bg-amber-200/[.06] p-3">
                <p className="text-[11.5px] font-semibold text-amber-100/90">
                  Step {approvalHashes.length + 1} of {approvals.length}: token approval
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/60">
                  {approvals[approvalHashes.length]?.narration}
                </p>
                <dl className="mt-2 space-y-0.5 text-[10px] text-white/45">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0">Contract</dt>
                    <dd className="min-w-0 break-all text-right font-mono text-white/60">{approvals[approvalHashes.length]?.to}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0">Call</dt>
                    <dd className="min-w-0 break-words text-right font-mono text-white/60">
                      {approvals[approvalHashes.length]?.call.method}
                    </dd>
                  </div>
                </dl>
                {approvalHashes.length > 0 && (
                  <p className="mt-2 text-[10px] text-white/35">
                    Sent: {approvalHashes.map((hash) => `${hash.slice(0, 10)}…`).join(", ")} — waiting
                    for the chain to confirm.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void runApprovals()}
                  disabled={busy !== null}
                  className="btn btn-primary mt-2.5 w-full disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "signing"
                    ? "Confirm in your wallet…"
                    : busy === "preparing" || busy === "recording"
                      ? "Waiting for the approval to land…"
                      : approvalHashes.length > 0
                        ? "Approve next step"
                        : "Approve with wallet"}
                </button>
                <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                  This is a separate transaction from the swap. It moves no tokens — it only sets
                  the allowance shown above, and the swap is prepared again once the chain confirms it.
                </p>
              </div>
            )}

            {!prepared && !approvals.length && executable && (
              <button
                type="button"
                onClick={() => void prepare()}
                disabled={busy !== null}
                className="btn btn-primary w-full shadow-[0_14px_34px_rgba(201,182,255,.22)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "preparing" ? "Simulating…" : "Simulate & review"}
              </button>
            )}

            {!prepared && !approvals.length && !executable && (
              <button
                type="button"
                disabled
                aria-describedby="execution-disabled-note"
                className="btn w-full cursor-not-allowed border border-white/[.10] bg-white/[.04] text-white/45"
              >
                Simulate &amp; review — unavailable
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
              <p id="execution-disabled-note" className="mt-2 text-[10.5px] leading-relaxed text-white/40">
                Quotes are live, but this deployment does not submit transactions:
                simulation and signing stay off until the operator enables{" "}
                <span className="font-mono">VETTO_SWAP_EXECUTION</span> after a small-value
                receipt test. Nothing was sent, and no approval was requested.
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
