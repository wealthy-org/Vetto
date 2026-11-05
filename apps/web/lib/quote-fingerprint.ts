import { createHash } from "node:crypto";

/**
 * Deterministic hashing helpers for the review → sign handoff.
 *
 * The server never accepts calldata, a recipient, a spender or an amount from
 * the browser for execution. It rebuilds the payload from the reviewed intent +
 * venue, hashes it, and only accepts a submission whose hash matches the stored
 * record (brief §16.6). Any change between review and signature is a mismatch.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Stable JSON: object keys sorted at every depth so hashing is deterministic. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite numbers are not hashable.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("Unsupported value in canonical JSON.");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface QuoteFingerprintInput {
  chainId: number;
  venueId: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  /** The minimum received the user actually reviewed. */
  minOutBaseUnits: string;
  slippageBps: number;
  router: string;
}

/**
 * Hash of the trade the user reviewed: chain, venue, pair, size, slippage and
 * the exact minimum received. Amounts that move between blocks (expected output,
 * expiry) are deliberately excluded so the digest stays comparable across a
 * fresh quote; the minimum is re-enforced against the fresh quote instead.
 */
export function fingerprintQuote(input: QuoteFingerprintInput): string {
  return sha256Hex(canonicalJson({ kind: "quote", ...input }));
}

export interface ExecutionPayload {
  chainId: number;
  to: string;
  data: string;
  value: string;
  /** Unix seconds after which the router rejects the transaction. */
  deadline: string;
}

/**
 * Hash of the exact transaction payload. The browser must send back the hash it
 * displayed, and the wallet must receive byte-identical `to`/`data`/`value`.
 */
export function fingerprintPayload(payload: ExecutionPayload): string {
  return sha256Hex(
    canonicalJson({
      kind: "payload",
      chainId: payload.chainId,
      to: payload.to.toLowerCase(),
      data: payload.data.toLowerCase(),
      value: BigInt(payload.value).toString(),
      deadline: payload.deadline,
    }),
  );
}

/** Constant-time-ish comparison for hex digests of equal length. */
export function sameDigest(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}
