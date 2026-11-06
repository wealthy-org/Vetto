import type { Capability } from "./types.ts";

/**
 * Single source of truth for "what is real". The landing page, docs and API all read this.
 * Flip a status to "verified" only with a passing integration test + demo tx receipt (see docs/INTEGRATION_MATRIX.md).
 */
export const CAPABILITIES: readonly Capability[] = Object.freeze([
  { id: "intent-preview", label: "Intent preview & clarification", status: "verified", note: "Deterministic parser with strict validation; unit-tested." },
  { id: "link-passive", label: "Passive link check", status: "verified", note: "URL policy only (https, public host). Reports “insufficient evidence” on its own." },
  { id: "wallet-signin", label: "Wallet sign-in", status: "planned", note: "SIWE supports Ethereum Mainnet and Robinhood Chain; verify WalletConnect provider and wallet support in deployment." },
  { id: "wallet-balances", label: "Wallet balances", status: "planned", note: "Read-only ETH/USDG balances compare at a shared block across two RPCs; verify the configured USDG contract before relying on its identity." },
  { id: "route-direct", label: "Live Uniswap v4 quotes", status: "verified", note: "Real quoteExactInputSingle results for three ETH/USDG pools, read from Robinhood Chain; the same quote is re-fetched from a second RPC during simulation and must match exactly." },
  { id: "permit2-approval", label: "Permit2 approvals", status: "planned", note: "Two separate wallet-signed steps (ERC-20 approve to Permit2, then Permit2 approve for the router) are built server-side with the exact amount and a 30-day expiry, and the swap is re-prepared only after the chain reports the allowance as sufficient. Implemented and unit-tested; not yet exercised end-to-end on mainnet funds." },
  { id: "transaction-prepare", label: "Simulation & transaction preparation", status: "planned", note: "Implemented and fail-closed: the server rebuilds the payload, simulates it from your wallet and re-checks the reviewed minimum. Signing stays off until VETTO_SWAP_EXECUTION is enabled after a funded receipt test." },
  { id: "execution-history", label: "Execution receipts & history", status: "planned", note: "Swap executions are stored with their payload hash; status moves to confirmed only when the chain returns a matching receipt. Requires database + opt-in execution." },
  { id: "route-split", label: "Split route", status: "planned", note: "Requires an executable multi-pool router." },
  { id: "route-solver", label: "Intent solver", status: "planned", note: "Needs real competing solvers on this chain." },
  { id: "route-rfq", label: "Market-maker RFQ", status: "planned", note: "Needs a live maker." },
  { id: "private-relay", label: "Private submission", status: "unavailable", note: "Unavailable on this chain until a relay is verified. Public after confirmation either way." },
  { id: "dapp-sandbox", label: "Sandboxed dApp scan", status: "planned", note: "Isolated browser + test wallet; Phase 3." },
  { id: "agent-tasks", label: "Burner mint / claim tasks", status: "planned", note: "Heavily restricted; Phase 3." },
  { id: "live-browser", label: "Live browser + takeover", status: "planned", note: "Isolated per-session compute; Phase 3." },
]);

export const capabilityById = (id: string) => CAPABILITIES.find((c) => c.id === id);
