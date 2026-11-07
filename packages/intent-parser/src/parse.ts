import { findAsset, listAssets, ROBINHOOD_CHAIN_ID } from "@vetto/asset-registry";
import { DecimalError, normalizeAmountText, parseDecimal } from "./decimal.ts";
import type { Intent, LlmParser, ParseContext, ParseResult, PendingIntent } from "./types.ts";
import { IntentValidationError, validateIntent } from "./validate.ts";

const MAX_INPUT = 500;
const MAX_SLIPPAGE_BPS = 1000; // 10% hard ceiling
/**
 * A failed LLM call must not read like a crash. The person sees one short line:
 * what still works, and that nothing happened. The operator-facing detail (which
 * variable to check, the provider status) belongs in the server log and the audit
 * trail, not in the chat bubble.
 */
export type ParseWarningCode =
  | "llm-auth"
  | "llm-model"
  | "llm-quota"
  | "llm-timeout"
  | "llm-unavailable"
  | "llm-invalid";

const STILL_WORKS = "Swaps and link checks still work: try “swap 0.1 ETH to USDG” or paste a link.";

const warningFor = (code: ParseWarningCode): string => {
  switch (code) {
    case "llm-auth":
      return `Free-form parsing is off on this deployment. ${STILL_WORKS} Nothing was executed.`;
    case "llm-model":
      return `Free-form parsing is off on this deployment. ${STILL_WORKS} Nothing was executed.`;
    case "llm-quota":
      return `Free-form parsing is rate-limited right now. ${STILL_WORKS} Nothing was executed.`;
    case "llm-timeout":
      return `Free-form parsing took too long and was skipped. ${STILL_WORKS} Nothing was executed.`;
    case "llm-unavailable":
      return `Free-form parsing is unreachable right now. ${STILL_WORKS} Nothing was executed.`;
    case "llm-invalid":
    default:
      return `Free-form parsing could not read that. ${STILL_WORKS} Nothing was executed.`;
  }
};

function classifyFailure(error: unknown): ParseWarningCode {
  const raw = error instanceof Error ? error.message : "";
  if (raw === "LLM_PROVIDER_TIMEOUT") return "llm-timeout";
  if (raw === "LLM_PROVIDER_DISABLED") return "llm-auth";
  const status = /^LLM_PROVIDER_HTTP_(\d{3})$/.exec(raw)?.[1];
  if (status === "401" || status === "403") return "llm-auth";
  if (status === "400" || status === "404") return "llm-model";
  if (status === "429") return "llm-quota";
  if (status) return "llm-unavailable";
  return "llm-invalid";
}

const URL_RE =
  /\b(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d+)?(?:\/[^\s?#]*)?(?:\?[^\s#]*)?(?:#\S*)?/i;
const SWAP_RE =
  /\b(?:swap|exchange|trade|convert)\s+\$?(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([a-z][a-z0-9]{1,9})\b(?:\s+(?:to|for|into|->|→)\s+([a-z][a-z0-9]{1,9})\b)?/i;
const INDONESIAN_SWAP_RE =
  /\b(?:tolong\s+)?(?:ubah(?:kan)?|tukar|konversi(?:kan)?)\s+(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([a-z][a-z0-9]{1,9})(?:\s+(?:saya|ku|milik saya))?\s+(?:ke|jadi|menjadi)\s+([a-z][a-z0-9]{1,9})\b/i;
const SLIPPAGE_RE = /slippage\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*slippage/i;
const SPEND_RE =
  /\b(?:max(?:imum)?|up to|cap(?:ped)?(?: at)?|budget(?: of)?|limit(?: of)?)\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*([a-z]{2,10})\b/i;
const SAFETY_WORDS = /\b(safe|safety|check|inspect|scam|legit|trust|trustworthy|rug|phish\w*|drainer|audit)\b/i;

export const sanitize = (t: string) => t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const result = (intent: Intent, label: string, pendingIntent?: PendingIntent): ParseResult =>
  pendingIntent ? { intent, label, pendingIntent } : { intent, label };
const clarify = (question: string, choices?: string[]): ParseResult =>
  result(choices ? { kind: "clarification", question, choices } : { kind: "clarification", question }, question);

function extractUrl(text: string): { url?: string; rest: string } {
  const m = URL_RE.exec(text);
  if (!m) return { rest: text };
  const raw = m[0].replace(/[.,;:!?)]+$/, "");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: string | undefined;
  try { url = new URL(withScheme).toString(); } catch { url = undefined; }
  // Remove the URL from the text so words inside hostnames ("claim-…") never trigger actions.
  return { url, rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim() };
}

const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };

interface SwapInput {
  amountText: string; tokenIn: string; tokenOut?: string | undefined;
  privateRequested: boolean; slippagePct?: string | undefined;
}

/** Shared by the deterministic parser and the (untrusted) LLM path. */
function buildSwap(i: SwapInput): ParseResult {
  const tIn = findAsset(i.tokenIn);
  if (!tIn) {
    return clarify(`I don't have ${i.tokenIn.toUpperCase()} in the asset registry, so I won't guess a contract. Which token did you mean?`);
  }
  let amount: string;
  let units: bigint;
  try {
    amount = normalizeAmountText(i.amountText);
    units = parseDecimal(amount, tIn.decimals);
  } catch (e) {
    return clarify(e instanceof DecimalError ? `${e.message}. How much ${tIn.symbol} do you want to swap?` : "How much do you want to swap?");
  }
  if (units === 0n) return clarify(`The amount is zero. How much ${tIn.symbol} do you want to swap?`);

  let slippageBps: number | undefined;
  if (i.slippagePct !== undefined) {
    try { slippageBps = Number(parseDecimal(i.slippagePct, 2)); } catch { return clarify("Slippage supports at most two decimal places, e.g. 0.5%."); }
    if (slippageBps < 1 || slippageBps > MAX_SLIPPAGE_BPS) return clarify("Max slippage must be between 0.01% and 10%.");
  }

  if (!i.tokenOut) {
    const others = listAssets().filter((a) => a.symbol !== tIn.symbol);
    const pendingIntent: PendingIntent = {
      kind: "swap", tokenIn: tIn.symbol, amountIn: amount, privateRequested: i.privateRequested,
      ...(slippageBps !== undefined ? { slippageBps } : {}),
    };
    return result(
      { kind: "clarification", question: `Swap ${amount} ${tIn.symbol} into what?`, choices: others.map((a) => `swap ${amount} ${tIn.symbol} to ${a.symbol}`) },
      `Swap ${amount} ${tIn.symbol} into what?`,
      pendingIntent,
    );
  }
  const tOut = findAsset(i.tokenOut);
  if (!tOut) return clarify(`I don't have ${i.tokenOut.toUpperCase()} in the asset registry, so I won't guess a contract. Which token did you mean?`);
  if (tOut.symbol === tIn.symbol) return clarify(`${tIn.symbol} to ${tIn.symbol} is not a swap. Pick a different destination token.`);

  const intent: Intent = { kind: "swap", chainId: ROBINHOOD_CHAIN_ID, tokenIn: tIn.symbol, tokenOut: tOut.symbol, amountIn: amount, privateRequested: i.privateRequested };
  if (slippageBps !== undefined) intent.slippageBps = slippageBps;
  const parts = [
    `Swap ${amount} ${tIn.symbol} → ${tOut.symbol}`,
    "Robinhood Chain",
    i.privateRequested ? "private submission requested" : "public submission",
  ];
  if (slippageBps !== undefined) parts.push(`max slippage ${(slippageBps / 100).toString()}%`);
  return result(intent, parts.join(" · "));
}

/** Deterministic parser: free text -> typed intent + visible interpretation. */
export function parseIntent(input: string, ctx: ParseContext = {}): ParseResult {
  const text = sanitize(input);
  if (!text) return result({ kind: "chat", text: "" }, "Type a request — I'll show how I read it before anything runs.");
  if (text.length > MAX_INPUT) return clarify(`That's too long for one request (max ${MAX_INPUT} characters). Try a shorter one.`);

  const { url: found, rest } = extractUrl(text);
  const url = found ?? ctx.lastUrl;

  if (/\b(take (?:the )?(?:control|controls|wheel)|take over)\b/i.test(rest)) {
    return result({ kind: "live-browser", action: "take-control" }, "Take control of the live browser session");
  }
  if (/\bend and wipe\b/i.test(rest) || (/\b(end|stop|close|wipe)\b/i.test(rest) && /\b(session|browser)\b/i.test(rest))) {
    return result({ kind: "live-browser", action: "end" }, "End the live browser session and wipe it");
  }

  const task = /\b(mint|claim)\b/i.exec(rest);
  if (task) {
    const action = task[1]!.toLowerCase() as "mint" | "claim";
    if (!url) return clarify(`Which site should I ${action} on? Paste the link.`);
    const m = SPEND_RE.exec(rest);
    const sym = m?.[2] ? findAsset(m[2]) : undefined;
    if (!m || !sym) {
      return clarify(`What's the most you're willing to spend on this ${action}? I only use a capped burner wallet.`,
        ["0.005 ETH", "0.01 ETH", "0.05 ETH"].map((c) => `${text} max ${c}`));
    }
    let spend: string;
    try { spend = normalizeAmountText(m[1]!); parseDecimal(spend, sym.decimals); } catch { return clarify("That spend limit isn't a valid amount."); }
    return result({ kind: "agent-task", url, action, maxSpend: `${spend} ${sym.symbol}` },
      `${action === "mint" ? "Mint" : "Claim"} on ${host(url)} · burner wallet · max ${spend} ${sym.symbol}`);
  }

  const swap = SWAP_RE.exec(rest) ?? INDONESIAN_SWAP_RE.exec(rest);
  if (swap) {
    const tokenIn = swap[2]!;
    const contextualTokenOut = ctx.lastPair?.tokenIn.toUpperCase() === tokenIn.toUpperCase()
      ? ctx.lastPair.tokenOut
      : undefined;
    return buildSwap({
      amountText: swap[1]!, tokenIn, tokenOut: swap[3] ?? contextualTokenOut,
      privateRequested: /\bprivate(?:ly)?\b/i.test(rest),
      slippagePct: SLIPPAGE_RE.exec(rest)?.slice(1).find((g) => g !== undefined),
    });
  }
  if (/\b(buy|sell)\b/i.test(rest) && !url) {
    return clarify("I trade by pairs. Say it like “swap 100 USDG to ETH”.");
  }

  if (/\b(open|launch|start|watch)\b/i.test(rest) && /\b(live|browser|session)\b/i.test(rest)) {
    return result(url ? { kind: "live-browser", action: "start", url } : { kind: "live-browser", action: "start" },
      url ? `Open ${host(url)} in an isolated live browser` : "Open an isolated live browser");
  }
  if (url && (SAFETY_WORDS.test(rest) || rest.replace(/[^a-z]/gi, "").length < 3)) {
    return result({ kind: "inspect", url }, `Check ${host(url)} before you connect`);
  }
  const followUpToken = /^(?:to\s+)?([a-z][a-z0-9]{1,9})$/i.exec(text)?.[1];
  if (ctx.pendingIntent && followUpToken && findAsset(followUpToken)) {
    return buildSwap({
      amountText: ctx.pendingIntent.amountIn,
      tokenIn: ctx.pendingIntent.tokenIn,
      tokenOut: followUpToken,
      privateRequested: ctx.pendingIntent.privateRequested,
      slippagePct: ctx.pendingIntent.slippageBps !== undefined
        ? (ctx.pendingIntent.slippageBps / 100).toString()
        : undefined,
    });
  }
  if (found) {
    return clarify(`What should I do with ${host(found)}?`, [`Is ${host(found)} safe?`, `Open ${host(found)} live`]);
  }
  return result({ kind: "chat", text }, "Just chatting — nothing will run.");
}

/**
 * Deterministic first; the LLM only gets a chance when we'd otherwise fall back to chat.
 * Its output is validated, then rebuilt through the same registry/decimal checks as typed
 * input. It never chooses addresses, spenders or calls. Only swaps and clarification
 * questions are accepted; any other kind or failure falls back to the deterministic result.
 */
export async function parseIntentWithLlm(
  input: string,
  ctx: ParseContext,
  llm?: LlmParser,
): Promise<ParseResult> {
  const first = parseIntent(input, ctx);

  if (first.intent.kind !== "chat" || !first.intent.text) {
    return first;
  }

  if (!llm) return first;

  try {
    const v = validateIntent(await llm(sanitize(input), ctx));

    if (v.kind === "swap") {
      console.warn(
        "LLM attempted to create a swap without deterministic parser confirmation.",
      );

      return clarify(
        "I cannot verify the swap parameters from your message. Please specify the amount and token pair explicitly, for example: swap 0.1 ETH to USDG.",
      );
    }

    if (v.kind === "clarification") {
      return clarify(v.question);
    }

    return {
      ...first,
      warning: warningFor("llm-invalid"),
      warningCode: "llm-invalid",
    };
    } catch (error) {
    if (error instanceof IntentValidationError) {
      console.warn("LLM returned an invalid intent; asking for clarification.");

      return clarify(
        "I could not verify the requested swap. Please specify the amount and token pair explicitly.",
      );
    }

    const code = classifyFailure(error);
    console.warn(
      `LLM intent parsing unavailable (${code}); deterministic fallback used.`,
    );

    if (code === "llm-timeout") {
      return {
        ...clarify(
          "Free-form parsing took too long. Please specify the amount and token pair explicitly, for example: swap 0.1 ETH to USDG.",
        ),
        warning: warningFor(code),
        warningCode: code,
      };
    }

    return {
      ...first,
      warning: warningFor(code),
      warningCode: code,
    };
  }
}
