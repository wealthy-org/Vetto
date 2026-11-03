import { findAsset, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import type { Intent } from "./types.ts";

export class IntentValidationError extends Error {}

const SYMBOL_RE = /^[A-Z0-9]{2,10}$/;
const AMOUNT_RE = /^\d+(?:\.\d+)?$/;
const SPEND_RE = /^\d+(?:\.\d+)? [A-Z0-9]{2,10}$/;
const MAX_URL = 2048;

function fail(msg: string): never {
  throw new IntentValidationError(msg);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, what: string): string => {
  if (typeof v !== "string" || v.length === 0 || v.length > max) fail(`${what} must be a non-empty string ≤ ${max}`);
  return v;
};
const url = (v: unknown): string => {
  const s = str(v, MAX_URL, "url");

  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    fail("url is not parseable");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail("only HTTP and HTTPS URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    fail("URLs containing credentials are not allowed");
  }

  return s;
};

/**
 * Strict gate for anything not produced by our own deterministic parser (e.g. an LLM).
 * Rebuilds the object field-by-field so unknown keys can never travel further.
 * Addresses are rejected on purpose: only registry symbols are accepted.
 */
export function validateIntent(raw: unknown): Intent {
  if (!isObj(raw)) fail("intent must be an object");
  switch (raw.kind) {
    case "swap": {
      if (raw.chainId !== ROBINHOOD_CHAIN_ID) fail("chain mismatch");
      const tokenIn = str(raw.tokenIn, 10, "tokenIn");
      const tokenOut = str(raw.tokenOut, 10, "tokenOut");
      const assetIn = findAsset(tokenIn);
      const assetOut = findAsset(tokenOut);

      if (!assetIn || !assetOut) {
        fail("tokens must exist in the asset registry");
      }

      if (assetIn.symbol === assetOut.symbol) {
        fail("input and output tokens must be different");
      }
      const amountIn = str(raw.amountIn, 40, "amountIn");
      if (!AMOUNT_RE.test(amountIn)) fail("amountIn must be a plain decimal string");
      if (typeof raw.privateRequested !== "boolean") fail("privateRequested must be boolean");
      const out: Intent = {
        kind: "swap",
        chainId: ROBINHOOD_CHAIN_ID,
        tokenIn: assetIn.symbol,
        tokenOut: assetOut.symbol,
        amountIn,
        privateRequested: raw.privateRequested,
      };
      if (raw.slippageBps !== undefined) {
        const b = raw.slippageBps;
        if (typeof b !== "number" || !Number.isInteger(b) || b < 1 || b > 1000) fail("slippageBps must be an integer 1–1000");
        out.slippageBps = b;
      }
      return out;
    }
    case "inspect":
      return { kind: "inspect", url: url(raw.url) };
    case "agent-task": {
      if (raw.action !== "mint" && raw.action !== "claim") fail("unknown task action");
      const maxSpend = str(raw.maxSpend, 40, "maxSpend");
      if (!SPEND_RE.test(maxSpend)) fail('maxSpend must look like "0.01 ETH"');
      return { kind: "agent-task", url: url(raw.url), action: raw.action, maxSpend };
    }
    case "live-browser": {
      if (raw.action !== "start" && raw.action !== "take-control" && raw.action !== "end") fail("unknown browser action");
      return raw.url === undefined
        ? { kind: "live-browser", action: raw.action }
        : { kind: "live-browser", action: raw.action, url: url(raw.url) };
    }
    case "clarification": {
      const question = str(raw.question, 300, "question");
      if (raw.choices === undefined) return { kind: "clarification", question };
      if (!Array.isArray(raw.choices) || raw.choices.length > 6) fail("choices must be an array ≤ 6");
      return { kind: "clarification", question, choices: raw.choices.map((c) => str(c, 200, "choice")) };
    }
    case "chat":
      return { kind: "chat", text: str(raw.text, 1000, "text") };
    default:
      return fail("unknown intent kind");
  }
}
