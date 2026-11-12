"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MAINNET_EXPLORER, PREVIEW_PROOF, TxProofModal } from "./TxProofModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { english } from "viem/accounts";
import { findAsset, listAssets } from "@vetto/asset-registry";
import {
  parseIntent,
  type Intent,
  type ParseContext,
  type ParseResult,
} from "@vetto/intent-parser";
import { capabilityById, type QuoteResult } from "@vetto/quote-engine";
import { detectSecret, secretMessage, type RiskReport } from "@vetto/safety-policy";
import { AccountMenu } from "./AccountMenu";
import { formatAmount } from "@/lib/format";
import { isTestnetDeployment, networkLabel, networkShortLabel, TESTNET_DISCLOSURE } from "@/lib/chain-label";
import { Banker } from "./Banker";
import { Logo, Mark } from "./Logo";
import { RouteCards } from "./RouteCards";
import { StatusChip } from "./StatusChip";
import { SwapReview } from "./SwapReview";
import { IconArrow, IconLock } from "./icons";

type InspectResponse = { host: string | null; report: RiskReport };
type Msg = {
  id: number;
  role: "user" | "banker";
  text: string;
  /** One-line recap of what the parser understood, shown next to "You ·". */
  summary?: string;
  result?: ParseResult;
  quote?: QuoteResult;
  inspect?: InspectResponse;
  capId?: string;
};
type HistoryItem = { id: string; prompt: string; createdAt: string };
type HistoryEntry = { id: string; prompt: string };
type HistoryMode = "loading" | "preview" | "saved" | "error";
type TxItem = {
  id: string;
  status: "prepared" | "submitted" | "confirmed" | "reverted" | "expired";
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  venueId: string;
  txHash: string | null;
  createdAt: string;
};

/**
 * Examples are built from the asset registry, never hardcoded: on a testnet
 * deployment the registry holds test tokens, and a chip that names USDG would
 * dead-end in "I don't have that symbol".
 */
const QUOTE_SYMBOL = listAssets().find((asset) => asset.symbol !== "ETH")?.symbol ?? "ETH";

const SUGGESTIONS = [
  `Swap 100 ${QUOTE_SYMBOL} to ETH`,
  `Swap 0.01 ETH to ${QUOTE_SYMBOL}`,
  "Is fastclaim-hood.xyz safe?",
  "Mint the NFT at nft-mint-pass.app max 0.01 ETH",
];
const PRIVATE_COPY =
  "Private submission is not available yet. No verified privacy relay is connected on Robinhood Chain.";
const BIP39_WORDS = new Set<string>(english);

class ApiError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
const REDACTED = "••• not sent: looked like a secret •••";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, json.code);
  return json;
}

const urlOf = (i: Intent) => ("url" in i && i.url ? i.url : undefined);
const CAP_FOR: Partial<Record<Intent["kind"], string>> = {
  "agent-task": "agent-tasks",
  "live-browser": "live-browser",
};

export interface ChainDisplay {
  label: string;
  short: string;
  testnet: boolean;
  explorer?: string;
}

export function ChatApp({ chain }: { chain?: ChainDisplay } = {}) {
  const chainView: ChainDisplay = chain ?? {
    label: networkLabel(),
    short: networkShortLabel(),
    testnet: isTestnetDeployment(),
  };
  const params = useSearchParams();
  // Local-only preview of the post-swap proof popup (no env needed): /app?txProofPreview=1
  const [previewProof, setPreviewProof] = useState(
    () => process.env.NODE_ENV === "development" && params.get("txProofPreview") === "1",
  );
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [privNote, setPrivNote] = useState(false);
  const [savedHistory, setSavedHistory] = useState<HistoryItem[]>([]);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("loading");
  const [historyError, setHistoryError] = useState("");
  const [historyAction, setHistoryAction] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [txRefresh, setTxRefresh] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const historyReadyRef = useRef<Promise<boolean> | null>(null);

  // `?ask=` pre-fills the composer. It never auto-sends: nothing runs until the person presses Enter.
  useEffect(() => {
    const a = params.get("ask");
    if (a) setInput(a.slice(0, 500));
  }, [params]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  useEffect(() => {
    let resolveHistory: (authenticated: boolean) => void = () => {};
    let active = true;
    historyReadyRef.current = new Promise((resolve) => {
      resolveHistory = resolve;
    });

    void fetch("/api/history", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          if (active) setHistoryMode("preview");
          resolveHistory(false);
          return;
        }
        const body = (await response.json()) as { items?: HistoryItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? `History request failed (${response.status}).`);
        if (!Array.isArray(body.items)) throw new Error("The history response was invalid.");
        if (active) {
          setSavedHistory(body.items);
          setHistoryMode("saved");
        }
        resolveHistory(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setHistoryMode("error");
          setHistoryError(
            error instanceof Error ? error.message : "Chat history is temporarily unavailable.",
          );
        }
        resolveHistory(false);
      });

    return () => {
      active = false;
      resolveHistory(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/executions?limit=10", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { executions?: TxItem[] };
        if (active && Array.isArray(body.executions)) setTransactions(body.executions);
      })
      .catch(() => {
        /* transaction history is best-effort; the review panel stays authoritative */
      });
    return () => {
      active = false;
    };
  }, [txRefresh]);

  useEffect(() => {
    if (!historyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    historyCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
      historyTriggerRef.current?.focus();
    };
  }, [historyOpen]);

  useEffect(() => {
    const clearSavedHistory = () => {
      setSavedHistory([]);
      setHistoryMode("preview");
      setHistoryError("");
      setTransactions([]);
    };
    window.addEventListener("vetto:session-ended", clearSavedHistory);
    return () => window.removeEventListener("vetto:session-ended", clearSavedHistory);
  }, []);

  const lastUrl = useMemo(
    () => [...msgs].reverse().map((m) => (m.result ? urlOf(m.result.intent) : undefined)).find(Boolean),
    [msgs],
  );
  const lastPair = useMemo(() => {
    const previousSwap = [...msgs].reverse().find((m) => m.result?.intent.kind === "swap");
    const intent = previousSwap?.result?.intent;
    return intent?.kind === "swap" ? { tokenIn: intent.tokenIn, tokenOut: intent.tokenOut } : undefined;
  }, [msgs]);
  const pendingIntent = useMemo(() => {
    const lastResponse = [...msgs].reverse().find((m) => m.role === "banker" && m.result);
    return lastResponse?.result?.pendingIntent;
  }, [msgs]);
  const parseContext = useMemo<ParseContext>(
    () => ({
      ...(lastUrl ? { lastUrl } : {}),
      ...(lastPair ? { lastPair } : {}),
      ...(pendingIntent ? { pendingIntent } : {}),
    }),
    [lastUrl, lastPair, pendingIntent],
  );
  const preview = useMemo(() => parseIntent(input, parseContext), [input, parseContext]);
  const typedSecret = useMemo(() => detectSecret(input, BIP39_WORDS), [input]);
  const history = useMemo(
    () =>
      historyMode === "saved"
        ? savedHistory.map((item) => ({ id: item.id, prompt: item.prompt }))
        : [...new Set(msgs.filter((m) => m.role === "user").map((m) => m.text))]
            .reverse()
            .map((prompt) => ({ id: prompt, prompt })),
    [historyMode, savedHistory, msgs],
  );

  const selectHistory = (prompt: string) => {
    setInput(prompt);
    setHistoryOpen(false);
  };
  const startNewChat = () => {
    setMsgs([]);
    setInput("");
    setSelectedPath(null);
    setHistoryOpen(false);
  };
  const active = useMemo(
    () =>
      [...msgs]
        .reverse()
        .find(
          (m) =>
            m.result &&
            (m.result.intent.kind === "swap" || m.result.intent.kind === "inspect" || m.capId),
        ),
    [msgs],
  );
  const activeRoutes = active?.quote?.routes ?? [];

  // A new quote means a new deck: the previous card selection no longer applies.
  useEffect(() => {
    setSelectedPath(null);
  }, [active?.quote]);

  const push = (m: Omit<Msg, "id">) => {
    const id = ++seq.current;
    setMsgs((p) => [...p, { ...m, id }]);
    return id;
  };
  const patch = (id: number, p: Partial<Msg>) =>
    setMsgs((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function saveHistoryPrompt(prompt: string) {
    const authenticated = await historyReadyRef.current;
    if (!authenticated) return;
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ prompt }),
      });
      const body = (await response.json()) as { item?: HistoryItem; error?: string };
      if (response.status === 401) {
        setHistoryMode("preview");
        setSavedHistory([]);
        setHistoryError("Your sign-in expired. Sign in again to save history.");
        return;
      }
      if (!response.ok || !body.item) throw new Error(body.error ?? `History save failed (${response.status}).`);
      setSavedHistory((items) => [body.item!, ...items.filter((item) => item.id !== body.item!.id)].slice(0, 50));
      setHistoryError("");
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Chat history could not be saved.");
    }
  }

  async function deleteSavedHistory(body: { id: string } | { clearAll: true }, actionKey: string) {
    if (historyAction) return;
    setHistoryAction(actionKey);
    setHistoryError("");
    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { deleted?: boolean; deletedCount?: number; error?: string };
      if (response.status === 401) {
        setHistoryMode("preview");
        setSavedHistory([]);
        setHistoryError("Your sign-in expired. Sign in again to manage saved history.");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? `History deletion failed (${response.status}).`);
      if ("clearAll" in body) setSavedHistory([]);
      else setSavedHistory((items) => items.filter((item) => item.id !== body.id));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Chat history could not be deleted.");
    } finally {
      setHistoryAction(null);
    }
  }

  function confirmDeleteHistoryItem(item: HistoryItem) {
    if (window.confirm("Delete this saved request? This cannot be undone.")) {
      void deleteSavedHistory({ id: item.id }, item.id);
    }
  }

  function confirmClearSavedHistory() {
    if (window.confirm("Delete all saved chat history? This cannot be undone.")) {
      void deleteSavedHistory({ clearAll: true }, "clear-all");
    }
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    const local = detectSecret(text, BIP39_WORDS);
    if (local) {
      push({ role: "user", text: REDACTED });
      push({ role: "banker", text: secretMessage(local) });
      return;
    }

    setBusy(true);
    const userMsgId = push({ role: "user", text });
    try {
      const result = await post<ParseResult>("/api/intent", { text, context: parseContext });
      const i = result.intent;
      patch(userMsgId, { summary: result.label });
      void saveHistoryPrompt(text);
      const id = push({
        role: "banker",
        text:
          i.kind === "clarification"
            ? i.question
            : i.kind === "chat"
              ? result.warning ??
                `I can quote swaps and check links before you connect. Try “swap 0.1 ETH to ${QUOTE_SYMBOL}” or paste a link. Nothing runs until you approve it.`
              : "Here’s how I read that.",
        result,
        ...(CAP_FOR[i.kind] ? { capId: CAP_FOR[i.kind]! } : {}),
      });
      if (i.kind === "swap") patch(id, { quote: await post<QuoteResult>("/api/quotes", { intent: i }) });
      if (i.kind === "inspect") patch(id, { inspect: await post<InspectResponse>("/api/inspect", { url: i.url }) });
    } catch (e) {
      if (e instanceof ApiError && e.code === "SECRET_DETECTED") {
        patch(userMsgId, { text: REDACTED });
        push({ role: "banker", text: e.message });
        return;
      }
      push({
        role: "banker",
        text: `That didn’t go through: ${e instanceof Error ? e.message : "unknown error"}. Nothing was executed.`,
      });
    } finally {
      setBusy(false);
    }
  }

  const kindTone = preview.intent.kind === "clarification" ? "text-peach" : "text-lilac";

  const activeOut = findAsset(
    active?.result?.intent.kind === "swap" ? active.result.intent.tokenOut : "",
  );

  // The character's line: only ever restates something the app actually measured.
  const stageLine = useMemo(() => {
    if (busy) return undefined;
    if (!active) {
      return msgs.length > 0
        ? "I read that. Ask for a swap and the live pools answer here."
        : "Say what you want. I quote the live pools — never a mock.";
    }
    const intent = active.result?.intent;
    if (intent?.kind === "inspect") {
      return "Passive link check. Nothing was connected, nothing was signed.";
    }
    if (intent?.kind === "swap") {
      if (!active.quote) return "Asking the pool manager…";
      if (activeRoutes.length === 0) return active.quote.message;
      const best = activeRoutes.reduce((a, b) =>
        BigInt(b.expectedOutBaseUnits) > BigInt(a.expectedOutBaseUnits) ? b : a,
      );
      const amountText = formatAmount(best.expectedOutBaseUnits, activeOut?.decimals ?? 0);
      const symbol = activeOut?.symbol ?? "";
      return activeRoutes.length === 1
        ? `One pool answered this size: ${amountText} ${symbol}.`
        : `${activeRoutes.length} live pools. Best output ${amountText} ${symbol}.`;
    }
    if (intent?.kind === "clarification") return "One detail is missing — add it and I'll quote.";
    return "I can quote live swaps and check links before you connect.";
  }, [busy, active, activeRoutes, activeOut, msgs.length]);

  // One user message + the reply it produced share a card, like a single exchange.
  const exchanges = useMemo(() => {
    const groups: { key: number; user?: Msg; banker?: Msg }[] = [];
    for (const m of msgs) {
      const last = groups[groups.length - 1];
      if (m.role === "user" || !last || last.banker) {
        groups.push({ key: m.id, ...(m.role === "user" ? { user: m } : { banker: m }) });
      } else {
        last.banker = m;
      }
    }
    return groups;
  }, [msgs]);

  const [showEarlier, setShowEarlier] = useState(false);

  const renderExchange = (group: { key: number; user?: Msg; banker?: Msg }) => (
    <li
      key={group.key}
      className="cluster-in rounded-[22px] border border-white/[.09] bg-white/[.045] p-3 backdrop-blur-md"
    >
      {group.user && (
        <>
          <p className="text-[10.5px] text-lilac/70">
            You · {group.user.summary ?? group.user.text.slice(0, 46)}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-white/90">
            {group.user.text}
          </p>
        </>
      )}
      {group.banker && (
        <div className={group.user ? "mt-2.5 border-t border-white/[.07] pt-2.5" : ""}>
          <p className="text-[9.5px] uppercase tracking-[0.14em] text-white/30">Vetto</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-white/70">
            {group.banker.text}
          </p>
          {group.banker.result &&
            group.banker.result.intent.kind !== "chat" &&
            group.banker.result.intent.kind !== "clarification" && (
              <p className="mt-1.5 inline-block rounded-lg bg-lilac/[.09] px-2 py-1 text-[10.5px] text-lilac/90">
                {group.banker.result.label}
              </p>
            )}
          {group.banker.result?.intent.kind === "clarification" &&
            group.banker.result.intent.choices && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.banker.result.intent.choices.map((c) => (
                  <button key={c} type="button" className="chip !py-1 text-[10.5px]" onClick={() => void send(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          {group.banker.capId && <CapNote id={group.banker.capId} />}
          {group.banker.quote && (
            <p className="mt-1.5 text-[10.5px] text-white/45">
              {group.banker.quote.message}{" "}
              <button type="button" className="underline lg:hidden" onClick={() => setSheet(true)}>
                Open review
              </button>
            </p>
          )}
          {group.banker.inspect && (
            <p className="mt-1.5 text-[10.5px] text-white/45">
              Passive check done.{" "}
              <button type="button" className="underline lg:hidden" onClick={() => setSheet(true)}>
                See findings
              </button>
            </p>
          )}
        </div>
      )}
    </li>
  );

  const renderTranscript = (mode: "recent" | "all") => {
    const shown = mode === "all" || showEarlier ? exchanges : exchanges.slice(-1);
    const hidden = exchanges.length - shown.length;
    return (
      <>
        {msgs.length === 0 && (
          <div className="rounded-[22px] border border-white/[.07] bg-white/[.03] p-3 text-[12px] leading-relaxed text-white/50">
            Ask in your own words. I’ll show how I read it, quote real routes, simulate, then hand the signature to
            your wallet.
          </div>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowEarlier(true)}
            className="mb-2 text-[10.5px] text-white/35 transition-colors hover:text-white/70"
          >
            + {hidden} earlier {hidden === 1 ? "message" : "messages"}
          </button>
        )}
        <ol className="space-y-2.5">{shown.map(renderExchange)}</ol>
        {busy && <p className="mt-2 text-[11px] text-white/35 pulse-soft">Reading…</p>}
        {mode === "all" && <div ref={endRef} />}
      </>
    );
  };

  return (
    <div className="flex h-[100svh] min-w-0 flex-col overflow-hidden bg-ink">
      <header className="flex items-center justify-between gap-3 border-b border-white/[.05] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="VETTO home">
            <Logo />
          </Link>
          <span
            className={`chip hidden !py-1 text-[11px] sm:inline-flex ${
              chainView.testnet ? "!border-peach/30 text-peach" : "!border-lilac/20 text-white/70"
            }`}
          >
            <i className={`h-1.5 w-1.5 rounded-full ${chainView.testnet ? "bg-peach" : "bg-mint"}`} />
            {chainView.short}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            ref={historyTriggerRef}
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label={`Open chat history (${history.length})`}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            className="text-xs text-white/60 hover:text-white lg:hidden"
          >
            History <span className="text-white/35">({history.length})</span>
          </button>
          <AccountMenu />
          <Link href="/docs" className="hidden text-xs text-white/60 hover:text-white sm:inline">
            Docs
          </Link>
        </div>
      </header>

      {/* A testnet deployment says so on every screen, above the fold. */}
      {chainView.testnet && (
        <p
          role="note"
          className="border-b border-peach/20 bg-peach/[.07] px-3 py-1.5 text-center text-[11px] text-peach sm:px-4"
        >
          {TESTNET_DISCLOSURE}
        </p>
      )}

      <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,296px)_minmax(0,1fr)_minmax(0,356px)]">
        {/* LEFT — conversation, history, transactions */}
        <aside
          aria-label="Conversation"
          className="hidden min-h-0 flex-col overflow-y-auto border-r border-white/[.05] px-4 py-4 lg:flex"
        >
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-white/30">VETTO · your DeFi banker</p>
          <h1 className="h-display mt-2 text-[25px] leading-[1.06] text-white">
            Say what you want.
            <br />
            <span className="grad">I find the way.</span>
          </h1>
          <p className="mt-2 text-[11.5px] leading-relaxed text-white/40">
            Live quotes, a simulation, then your wallet decides. Nothing moves on its own.
          </p>

          <div className="mt-4">{renderTranscript("recent")}</div>

          <div className="mt-6">
            <HistoryContent
              history={history}
              savedHistory={savedHistory}
              mode={historyMode}
              error={historyError}
              action={historyAction}
              onSelect={selectHistory}
              onDelete={confirmDeleteHistoryItem}
              onClear={confirmClearSavedHistory}
              onNewChat={startNewChat}
            />
          </div>

          <TransactionsList items={transactions} explorer={chainView.explorer ?? MAINNET_EXPLORER} />
        </aside>

        {/* CENTER — stage, suggestions, composer */}
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="relative hidden min-h-0 flex-1 overflow-hidden lg:block" aria-hidden={msgs.length === 0}>
            <div className="stage-glow pointer-events-none absolute inset-0" />
            <div className="stage-vignette pointer-events-none absolute inset-0" />

            {/* The bubble lives inside the character's own box so it stays pinned just
                right of the head at every stage height, instead of drifting to the
                corner of the panel. */}
            <div className="stage-breathe absolute bottom-[-6%] left-1/2 h-[min(86%,620px)] w-max -translate-x-1/2">
              <Banker pose={busy ? "think" : "idle"} className="h-full w-auto" />
              <StageBubble text={stageLine} busy={busy} />
            </div>

            {activeRoutes.length > 0 && (
              <div className="absolute inset-x-0 bottom-3 z-20 px-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 bottom-4 h-32 rounded-[40px] bg-[radial-gradient(ellipse_at_50%_60%,rgba(104,68,224,.34),transparent_70%)] blur-[2px]"
                />
                <RouteCards
                  routes={activeRoutes}
                  selectedPath={selectedPath ?? activeRoutes[0]?.executionPathId ?? null}
                  onSelect={setSelectedPath}
                  outSymbol={activeOut?.symbol ?? ""}
                  outDecimals={activeOut?.decimals ?? 0}
                />
                <p className="mt-1.5 text-center text-[10px] text-white/30">
                  {activeRoutes.length === 1
                    ? "1 live route · tap it to review"
                    : `${activeRoutes.length} live routes · tap a card to review`}
                </p>
              </div>
            )}
          </div>

          {/* mobile transcript */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 lg:hidden">{renderTranscript("all")}</div>

          <div className="border-t border-white/[.05] px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-5">
            <div className="mx-auto max-w-[640px]">
              {activeRoutes.length > 0 && (
                <div className="mb-2 lg:hidden">
                  <RouteCards
                    variant="strip"
                    routes={activeRoutes}
                    selectedPath={selectedPath ?? activeRoutes[0]?.executionPathId ?? null}
                    onSelect={setSelectedPath}
                    outSymbol={activeOut?.symbol ?? ""}
                    outDecimals={activeOut?.decimals ?? 0}
                  />
                </div>
              )}

              <ul className="chip-row mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {SUGGESTIONS.map((s, i) => (
                  <li key={s} className="shrink-0" style={{ animationDelay: `${i * 60}ms` }}>
                    <button
                      type="button"
                      onClick={() => setInput(s)}
                      className="whitespace-nowrap rounded-full border border-white/[.09] bg-white/[.04] px-3 py-1.5 text-[11px] text-white/60 transition-all duration-200 hover:-translate-y-px hover:border-white/25 hover:text-white"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>

              <p aria-live="polite" className={`mb-1.5 min-h-[1rem] truncate px-1 text-[10.5px] ${kindTone}`}>
                {typedSecret ? (
                  <span className="text-coral">{secretMessage(typedSecret)}</span>
                ) : input.trim() ? (
                  <>
                    <span className="text-white/30">I read this as: </span>
                    {preview.label}
                  </>
                ) : (
                  <span className="text-white/25">{preview.label}</span>
                )}
              </p>

              <form
                className="composer-shell rounded-[20px] border border-white/[.1] bg-[#150f3a]/92 backdrop-blur-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <label htmlFor="composer" className="sr-only">
                  Your request
                </label>
                <textarea
                  id="composer"
                  rows={1}
                  value={input}
                  maxLength={500}
                  placeholder={`Ask VETTO: swap 100 ${QUOTE_SYMBOL} to ETH…`}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  className="max-h-32 min-h-[2.4rem] w-full resize-none bg-transparent px-3.5 pb-1 pt-2.5 text-[13.5px] leading-5 text-white outline-none placeholder:text-white/30 focus-visible:outline-none"
                />
                <div className="flex items-center gap-2 border-t border-white/[.06] px-2.5 py-2">
                  <span className="mr-auto text-[9.5px] leading-tight text-white/25">
                    Enter sends · Shift+Enter adds a line
                  </span>
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-pressed={privNote}
                    onClick={() => setPrivNote((v) => !v)}
                    title="Private submission"
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full border border-lilac/25 bg-lilac/[.14] px-3 py-1.5 text-[11px] text-white/75 transition-colors hover:bg-lilac/[.2]"
                  >
                    <IconLock className="h-3 w-3" /> Private
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !input.trim() || !!typedSecret}
                    aria-label="Send"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[linear-gradient(105deg,#f8cfc0,#eeb4ef)] text-[#2a1348] shadow-[0_6px_18px_rgba(238,180,239,.28)] transition-[filter,scale] duration-200 hover:scale-[1.05] hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconArrow className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {privNote && <p className="mt-1.5 px-1 text-[10.5px] text-white/45">{PRIVATE_COPY}</p>}
              <p className="mt-1.5 px-1 text-[10px] text-white/25">
                Nothing moves without your wallet confirmation. Quotes are live from Uniswap v4 on Robinhood Chain.
              </p>
            </div>
          </div>
        </main>

        {/* RIGHT — route review / findings */}
        <aside
          aria-label="Review"
          className={`fixed inset-x-0 bottom-0 z-40 max-h-[82svh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-4 transition-transform duration-300 lg:static lg:min-h-0 lg:max-h-none lg:translate-y-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-transparent lg:px-4 lg:py-4 ${
            sheet ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <span className="text-sm font-semibold">Review</span>
            <button type="button" className="text-sm text-white/60" onClick={() => setSheet(false)}>
              Close
            </button>
          </div>
          <Panel
            msg={active}
            selectedPath={selectedPath}
            onSelectPath={setSelectedPath}
            onRecorded={() => setTxRefresh((value) => value + 1)}
            chain={chainView}
          />
        </aside>
      </div>

      <TxProofModal proof={previewProof ? PREVIEW_PROOF : null} onClose={() => setPreviewProof(false)} />

      {/* mobile history drawer */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          role="presentation"
          onClick={() => setHistoryOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-history-title"
            onClick={(event) => event.stopPropagation()}
            className="relative flex h-full w-[min(22rem,88vw)] flex-col overflow-y-auto border-r border-white/10 bg-panel p-4 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="mobile-history-title" className="font-semibold">
                Chat history
              </h2>
              <button
                ref={historyCloseRef}
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close chat history"
                className="rounded-lg px-3 py-2 text-white/60 hover:bg-white/[.06] hover:text-white"
              >
                Close
              </button>
            </div>
            <HistoryContent
              history={history}
              savedHistory={savedHistory}
              mode={historyMode}
              error={historyError}
              action={historyAction}
              onSelect={selectHistory}
              onDelete={confirmDeleteHistoryItem}
              onClear={confirmClearSavedHistory}
              onNewChat={startNewChat}
            />
            <TransactionsList items={transactions} explorer={chainView.explorer ?? MAINNET_EXPLORER} />
          </aside>
        </div>
      )}
    </div>
  );
}

function StageBubble({ text, busy }: { text: string | undefined; busy: boolean }) {
  if (!busy && !text) return null;
  return (
    <div
      key={busy ? "busy" : text}
      className="bubble-in stage-bubble absolute z-30 w-max max-w-[210px]"
    >
      <div className="bubble-tail relative rounded-[16px] border border-white/25 bg-[#f7f4ff] px-3 py-2 text-[11.5px] leading-snug text-[#241747] shadow-[0_16px_38px_rgba(6,3,24,.5)]">
        {busy ? (
          <span className="flex items-center gap-1">
            <span className="typing-dot" style={{ animationDelay: "0ms" }} />
            <span className="typing-dot" style={{ animationDelay: "160ms" }} />
            <span className="typing-dot" style={{ animationDelay: "320ms" }} />
            <span className="ml-1 text-[#59487f]">reading your request…</span>
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function TransactionsList({ items, explorer }: { items: TxItem[]; explorer: string }) {
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-[11px] text-white/40">Transactions</h2>
      {items.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-white/25">
          Signed swaps appear here with their status. Nothing is listed until a wallet has signed it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const tone =
              item.status === "confirmed"
                ? "text-mint"
                : item.status === "reverted"
                  ? "text-coral"
                  : "text-white/50";
            const out = findAsset(item.tokenOut);
            return (
              <li key={item.id} className="rounded-lg border border-white/[.06] p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-white/70">
                    {item.tokenIn} → {item.tokenOut}
                  </span>
                  <span className={`shrink-0 capitalize ${tone}`}>{item.status}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-white/35">
                  <span className="truncate">{item.venueId.replace("rh-v4-eth-usdg-", "pool ")}</span>
                  <span className="shrink-0">
                    {out ? `${formatAmount(item.minOutBaseUnits, out.decimals)} min` : ""}
                  </span>
                </div>
                {item.txHash && (
                  <a
                    className="mt-1 inline-block text-lilac underline"
                    href={`${explorer}/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    receipt ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-white/25">
        Status comes from the chain receipt, not from the app.
      </p>
    </div>
  );
}

function HistoryContent({
  history,
  savedHistory,
  mode,
  error,
  action,
  onSelect,
  onDelete,
  onClear,
  onNewChat,
}: {
  history: HistoryEntry[];
  savedHistory: HistoryItem[];
  mode: HistoryMode;
  error: string;
  action: string | null;
  onSelect: (prompt: string) => void;
  onDelete: (item: HistoryItem) => void;
  onClear: () => void;
  onNewChat: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] text-white/40">Chat history</h2>
        <div className="flex items-center gap-2">
          {mode === "saved" && savedHistory.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              disabled={action !== null}
              className="text-[10.5px] text-white/40 hover:text-peach disabled:opacity-50"
            >
              {action === "clear-all" ? "Clearing…" : "Clear"}
            </button>
          )}
          <button type="button" onClick={onNewChat} className="text-[10.5px] text-lilac hover:text-white">
            + New
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-white/25">
          {mode === "saved"
            ? "Your saved requests will appear here."
            : "Requests from this session show up here. Sign in to keep them."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {history.slice(0, 12).map((item) => {
            const savedItem = mode === "saved" ? savedHistory.find((entry) => entry.id === item.id) : undefined;
            return (
              <li key={item.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(item.prompt)}
                  className="min-w-0 flex-1 truncate rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1.5 text-left text-[11px] text-white/65 hover:border-white/25 hover:text-white"
                >
                  {item.prompt}
                </button>
                {savedItem && (
                  <button
                    type="button"
                    onClick={() => onDelete(savedItem)}
                    disabled={action !== null}
                    aria-label={`Delete saved request: ${savedItem.prompt}`}
                    className="shrink-0 rounded px-1.5 py-1 text-[11px] text-white/30 hover:text-peach disabled:opacity-50"
                  >
                    {action === savedItem.id ? "…" : "×"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(mode === "error" || error) && (
        <p role="status" className="mt-2 text-[10.5px] text-peach">
          {error || "Saved history is temporarily unavailable."}
        </p>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-white/25">
        {mode === "saved" ? "Saved to your account." : "Preview history lives in this tab only."}
      </p>
    </>
  );
}

function CapNote({ id }: { id: string }) {
  const c = capabilityById(id);
  if (!c) return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/55">
      <StatusChip status={c.status} /> {c.label}: {c.note} Nothing was started.
    </p>
  );
}

function Panel({
  msg,
  selectedPath,
  onSelectPath,
  onRecorded,
  chain,
}: {
  msg: Msg | undefined;
  selectedPath: string | null;
  onSelectPath: (executionPathId: string) => void;
  onRecorded: () => void;
  chain?: ChainDisplay;
}) {
  const intent = msg?.result?.intent;

  if (!msg || !intent) {
    return (
      <div className="text-[12px] leading-relaxed text-white/45">
        <h2 className="mb-2 text-[11px] text-white/40">Route review</h2>
        <div className="rounded-2xl border border-white/[.08] bg-white/[.03] p-4">
          Ask for a swap and the live routes land here: amount received, minimum at your slippage, gas, and exactly what
          your wallet will be asked to approve.
        </div>
      </div>
    );
  }

  if (intent.kind === "swap") {
    return (
      <SwapReview
        intent={intent}
        quote={msg.quote}
        label={msg.result?.label}
        selectedPath={selectedPath}
        onSelectPath={onSelectPath}
        onRecorded={onRecorded}
        chain={chain}
      />
    );
  }

  if (intent.kind === "inspect") {
    const report = msg.inspect?.report;

    return (
      <div className="text-[12px]">
        <h2 className="mb-2 text-[11px] text-white/40">Link check</h2>
        <p className="mb-2 text-[11px] text-lilac">{msg.result?.label}</p>

        {!report ? (
          <p className="text-white/50">Checking…</p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`status ${
                  report.band === "dangerous"
                    ? "status-unavailable"
                    : report.band === "low concern"
                      ? "status-verified"
                      : "status-planned"
                } capitalize`}
              >
                {report.band}
              </span>
              {report.score !== null && <span className="text-[11px] text-white/45">score {report.score}/100</span>}
            </div>

            {report.findings.length === 0 ? (
              <p className="mb-3 text-white/55">No red flags in the checks that ran.</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {report.findings.map((finding) => (
                  <li key={finding.id} className="rounded-xl border border-white/10 bg-white/[.03] p-2.5 text-[11px]">
                    <div className="font-medium capitalize">
                      {finding.severity}: {finding.title}
                    </div>
                    <div className="mt-1 text-white/55">{finding.evidence}</div>
                    {finding.uncertainty && <div className="mt-1 text-white/35">Unknown: {finding.uncertainty}</div>}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mb-1 text-[10.5px] text-white/35">Checks run</h3>
            <ul className="space-y-0.5 text-[11px] text-white/65">
              {report.checksRun.map((check) => (
                <li key={check}>✓ {check}</li>
              ))}
            </ul>

            <h3 className="mb-1 mt-3 text-[10.5px] text-white/35">Not run yet</h3>
            <ul className="space-y-0.5 text-[11px] text-white/45">
              {report.checksUnavailable.map((check) => (
                <li key={check}>– {check}</li>
              ))}
            </ul>

            <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">{report.disclaimer}</p>
          </>
        )}
      </div>
    );
  }

  const cap = msg.capId ? capabilityById(msg.capId) : undefined;

  return cap ? (
    <div className="step-in text-[12px]">
      <h2 className="mb-2 text-[11px] text-white/40">Capability</h2>
      <p className="mb-2 font-semibold text-white">{cap.label}</p>
      <StatusChip status={cap.status} />
      <p className="mt-2 text-white/55">{cap.note}</p>
    </div>
  ) : null;
}
