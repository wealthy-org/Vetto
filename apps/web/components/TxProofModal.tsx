"use client";
import { useEffect, useRef, useState } from "react";

export const MAINNET_EXPLORER = "https://robinhoodchain.blockscout.com";

export interface TxProof {
  status: "confirmed" | "reverted";
  txHash: string;
  sent: string;
  receivedAtLeast: string;
  network: string;
  gasUsed: string | null;
  explorer: string;
  /** Shown when the modal is a local preview of an older mainnet tx. */
  note?: string;
}

/** Real mainnet swap used only by the local dev preview (`/app?txProofPreview=1`). */
export const PREVIEW_PROOF: TxProof = {
  status: "confirmed",
  txHash: "0xa8a93274c967949d5ded0104e8bc09854b1fd707c3bc8881698de6362eb1a4fc",
  sent: "0.0005 ETH",
  receivedAtLeast: "USDG (see explorer)",
  network: "Robinhood Chain · 4663",
  gasUsed: "134791",
  explorer: MAINNET_EXPLORER,
  note: "Dev preview: an earlier mainnet swap, shown to test this popup locally.",
};

const short = (v: string) => `${v.slice(0, 10)}…${v.slice(-8)}`;

/** Post-swap proof: only values taken from the chain receipt, plus the explorer link. */
export function TxProofModal({ proof, onClose }: { proof: TxProof | null; onClose: () => void }) {
  const primary = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!proof) return;
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proof, onClose]);

  if (!proof) return null;
  const ok = proof.status === "confirmed";
  const url = `${proof.explorer}/tx/${proof.txHash}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proof.txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-proof-title"
        onClick={(e) => e.stopPropagation()}
        className="bubble-in w-full max-w-[420px] rounded-[22px] border border-white/[.1] bg-[#120e2f] p-5 shadow-[0_30px_80px_rgba(4,2,18,.6)]"
      >
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${ok ? "bg-mint/15 text-mint" : "bg-coral/15 text-coral"}`}>
          {ok ? (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M7 7l10 10M17 7L7 17" strokeLinecap="round" /></svg>
          )}
        </div>

        <h2 id="tx-proof-title" className="mt-3 text-center text-[17px] font-semibold text-white">
          {ok ? "Swap confirmed on Robinhood Chain" : "Transaction reverted"}
        </h2>
        <p className="mt-1 text-center text-[12px] text-white/50">
          {ok ? "Status read from the chain receipt, not from the app." : "The chain receipt shows a revert. No swap output was received."}
        </p>

        <dl className="mt-4 text-[12.5px]">
          {[
            ["You sent", proof.sent],
            ...(ok ? [["Received at least", proof.receivedAtLeast]] : []),
            ["Network", proof.network],
            ...(proof.gasUsed ? [["Gas used", proof.gasUsed]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-t border-white/[.06] py-[7px]">
              <dt className="text-white/45">{k}</dt>
              <dd className="text-right text-white/85">{v}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-white/[.06] py-[7px]">
            <dt className="text-white/45">Tx hash</dt>
            <dd className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-white/85">{short(proof.txHash)}</span>
              <button type="button" onClick={copy} className="text-[11px] text-lilac hover:text-white">
                {copied ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
        </dl>

        {proof.note && <p className="mt-2 text-[11px] text-peach/80">{proof.note}</p>}

        <a
          ref={primary}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary mt-4 w-full justify-center"
        >
          View proof on Blockscout ↗
        </a>
        <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-[12.5px] text-white/55 hover:text-white">
          Close
        </button>
      </div>
    </div>
  );
}
