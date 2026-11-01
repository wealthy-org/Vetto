import type { Capability } from "./types.ts";

/**
 * Single source of truth for "what is real". The landing page, docs and API all read this.
 * Flip a status to "verified" only with a passing integration test + demo tx receipt (see docs/INTEGRATION_MATRIX.md).
 */
export const CAPABILITIES: readonly Capability[] = Object.freeze([
  { id: "intent-preview", label: "Intent preview & clarification", status: "verified", note: "Deterministic parser with strict validation; unit-tested." },
  { id: "link-passive", label: "Passive link check", status: "verified", note: "URL policy only (https, public host). Reports “insufficient evidence” on its own." },
  { id: "wallet-signin", label: "Wallet sign-in", status: "planned", note: "Needs a provider with Robinhood Chain support." },
  { id: "route-direct", label: "Direct pool swap (Uniswap v4)", status: "planned", note: "Waiting on Phase 0 verification of real, liquid pools." },
  { id: "transaction-prepare", label: "Transaction preparation", status: "planned", note: "Authenticated API is implemented but fails closed until Phase 0 verifies the chain, assets, and an executable route." },
  { id: "route-split", label: "Split route", status: "planned", note: "Requires an executable multi-pool router." },
  { id: "route-solver", label: "Intent solver", status: "planned", note: "Needs real competing solvers on this chain." },
  { id: "route-rfq", label: "Market-maker RFQ", status: "planned", note: "Needs a live maker." },
  { id: "private-relay", label: "Private submission", status: "unavailable", note: "Unavailable on this chain until a relay is verified. Public after confirmation either way." },
  { id: "dapp-sandbox", label: "Sandboxed dApp scan", status: "planned", note: "Isolated browser + test wallet; Phase 3." },
  { id: "agent-tasks", label: "Burner mint / claim tasks", status: "planned", note: "Heavily restricted; Phase 3." },
  { id: "live-browser", label: "Live browser + takeover", status: "planned", note: "Isolated per-session compute; Phase 3." },
]);

export const capabilityById = (id: string) => CAPABILITIES.find((c) => c.id === id);
