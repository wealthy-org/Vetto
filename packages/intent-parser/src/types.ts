import type { ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";

export type Intent =
  | { kind: "swap"; chainId: typeof ROBINHOOD_CHAIN_ID; tokenIn: string; tokenOut: string;
      amountIn: string; privateRequested: boolean; slippageBps?: number }
  | { kind: "inspect"; url: string }
  | { kind: "agent-task"; url: string; action: "mint" | "claim"; maxSpend: string }
  | { kind: "live-browser"; url?: string; action: "start" | "take-control" | "end" }
  | { kind: "clarification"; question: string; choices?: string[] }
  | { kind: "chat"; text: string };

/**
 * `label` is the visible interpretation line shown above the composer.
 * Clarification `choices` are complete commands the client can resubmit as-is.
 */
export interface ParseResult {
  intent: Intent;
  label: string;
  warning?: string;
  pendingIntent?: PendingIntent;
}

export interface PendingIntent {
  kind: "swap";
  tokenIn: string;
  amountIn: string;
  privateRequested: boolean;
  slippageBps?: number;
}

export interface ParseContext {
  lastUrl?: string;
  lastPair?: { tokenIn: string; tokenOut: string };
  pendingIntent?: PendingIntent;
}

/** Optional LLM adapter. Its output is untrusted data and goes through validateIntent(). */
export type LlmParser = (text: string, ctx: ParseContext) => Promise<unknown>;
