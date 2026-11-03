export type CapabilityStatus = "verified" | "planned" | "unavailable";
export type QuoteAdapterStatus = CapabilityStatus | "preview";

export interface Capability {
  id: string;
  label: string;
  status: CapabilityStatus;
  note: string;
}

/**
 * Normalised quote.
 * Fee estimates, when available, are denominated in tokenOut base units.
 * Unavailable estimates must be represented as null.
 */
export interface RouteQuote {
  quoteId: string;
  routeType: "direct" | "split" | "solver" | "private" | "rfq";
  provider: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  feeEstimatesAvailable: boolean;
  networkFeeEstimate: string | null;
  protocolFeeEstimate: string | null;
  priceImpactBps?: number;
  executableUntil: string; // ISO-8601
  executionPathId: string;
  isExecutable: boolean;
  verifiedPrivacyRelay?: boolean;
  latencyMs?: number;
}

export interface QuoteRequest {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  slippageBps: number;
  privateRequested: boolean;
}

export interface QuoteAdapter {
  id: string;
  /** Preview adapters may return quotes, but never executable routes. */
  status: QuoteAdapterStatus;
  quote(req: QuoteRequest, signal: AbortSignal): Promise<RouteQuote[]>;
}

export interface QuoteResult {
  routes: RouteQuote[];
  skipped: { adapterId: string; reason: string }[];
  /** Plain-language state for the UI. Never implies a route exists when none does. */
  message: string;
}