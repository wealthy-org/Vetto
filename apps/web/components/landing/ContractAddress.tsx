"use client";
import { useState } from "react";

export const CONTRACT_ADDRESS = "0xc0e0daa889ad607416f5c0fa00f92656e7ff455c";

export function ContractAddress({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy contract address"
      className={`chip max-w-full !bg-ink/60 font-mono text-[12px] backdrop-blur ${className}`}
    >
      <span className="text-white/45">CA</span>
      <span className="truncate text-white/85">
        <span className="hidden sm:inline">{CONTRACT_ADDRESS}</span>
        <span className="sm:hidden">{CONTRACT_ADDRESS.slice(0, 8)}…{CONTRACT_ADDRESS.slice(-6)}</span>
      </span>
      <span className={copied ? "text-mint" : "text-lilac"}>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
