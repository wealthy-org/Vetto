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

  /** Checksummed addresses of the traded currencies (symbols stay in tokenIn/tokenOut). */
  tokenInAddress?: string;
  tokenOutAddress?: string;
  /** Registered venue that produced this quote (executionPathId equals this id). */
  venueId?: string;
  /** Pool fee in basis points, as configured in the venue registry. */
  venueFeeBps?: number;
  /** Gas units returned by the quoter (an estimate, not a measurement). */
  gasUnits?: string;
  /** Estimated gas cost in wei of the native currency on the quote chain. */
  gasCostWei?: string;
  /** True once two independent RPC providers returned the same quote. */
  crossChecked?: boolean;
  /** Hash of the reviewed quote fields; required to prepare a transaction. */
  quoteFingerprint?: string;
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