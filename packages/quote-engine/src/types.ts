export type CapabilityStatus = "verified" | "planned" | "unavailable";

export interface Capability {
  id: string;
  label: string;
  status: CapabilityStatus;
  note: string;
}

/** Normalised quote. All fee fields are denominated in tokenOut base units so ranking is apples-to-apples. */
export interface RouteQuote {
  quoteId: string;
  routeType: "direct" | "split" | "solver" | "private" | "rfq";
  provider: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  networkFeeEstimate: string;
  protocolFeeEstimate: string;
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
  /** Only "verified" adapters are ever called. */
  status: CapabilityStatus;
  quote(req: QuoteRequest, signal: AbortSignal): Promise<RouteQuote[]>;
}

export interface QuoteResult {
  routes: RouteQuote[];
  skipped: { adapterId: string; reason: string }[];
  /** Plain-language state for the UI. Never implies a route exists when none does. */
  message: string;
}
