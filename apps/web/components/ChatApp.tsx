"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { english } from "viem/accounts";
import { findAsset } from "@vetto/asset-registry";
import { formatUnits, parseIntent, type Intent, type ParseResult } from "@vetto/intent-parser";
import { capabilityById, type QuoteResult } from "@vetto/quote-engine";
import { detectSecret, secretMessage, type RiskReport } from "@vetto/safety-policy";
import { Banker } from "./Banker";
import { Logo, Mark } from "./Logo";
import { StatusChip } from "./StatusChip";
import { SessionStatus } from "./SessionStatus";
import { WalletBalances } from "./WalletBalances";
import { IconArrow, IconLock } from "./icons";

type InspectResponse = { host: string | null; report: RiskReport };
type Msg = { id: number; role: "user" | "banker"; text: string; result?: ParseResult; quote?: QuoteResult; inspect?: InspectResponse; capId?: string };
type HistoryItem = { id: string; prompt: string; createdAt: string };
type HistoryEntry = { id: string; prompt: string };
type HistoryMode = "loading" | "preview" | "saved" | "error";

const SUGGESTIONS = ["Swap 100 USDG to ETH", "Is fastclaim-hood.xyz safe?", "Mint the NFT at nft-mint-pass.app max 0.01 ETH"];
const PRIVATE_COPY = "Private submission is available when the connected relay supports this network. Your transaction becomes public after confirmation.";
const BIP39_WORDS = new Set<string>(english);

class ApiError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}
const REDACTED = "••• not sent: looked like a secret •••";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, json.code);
  return json;
}

const urlOf = (i: Intent) => ("url" in i && i.url ? i.url : undefined);
const CAP_FOR: Partial<Record<Intent["kind"], string>> = { "agent-task": "agent-tasks", "live-browser": "live-browser" };

export function ChatApp() {
  const params = useSearchParams();
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
  const seq = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyCloseRef = useRef<HTMLButtonElement>(null);
  const historyReadyRef = useRef<Promise<boolean> | null>(null);

  // `?ask=` pre-fills the composer. It never auto-sends: nothing runs until the person presses Enter.
  useEffect(() => { const a = params.get("ask"); if (a) setInput(a.slice(0, 500)); }, [params]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);
  useEffect(() => {
    let resolveHistory: (authenticated: boolean) => void = () => {};
    let active = true;
    historyReadyRef.current = new Promise((resolve) => { resolveHistory = resolve; });

    void fetch("/api/history", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) {
        if (active) setHistoryMode("preview");
        resolveHistory(false);
        return;
      }
      const body = await response.json() as { items?: HistoryItem[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? `History request failed (${response.status}).`);
      if (!Array.isArray(body.items)) throw new Error("The history response was invalid.");
      if (active) {
        setSavedHistory(body.items);
        setHistoryMode("saved");
      }
      resolveHistory(true);
    }).catch((error: unknown) => {
      if (active) {
        setHistoryMode("error");
        setHistoryError(error instanceof Error ? error.message : "Chat history is temporarily unavailable.");
      }
      resolveHistory(false);
    });

    return () => {
      active = false;
      resolveHistory(false);
    };
  }, []);
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
    };
    window.addEventListener("vetto:session-ended", clearSavedHistory);
    return () => window.removeEventListener("vetto:session-ended", clearSavedHistory);
  }, []);

  const lastUrl = useMemo(() => [...msgs].reverse().map((m) => (m.result ? urlOf(m.result.intent) : undefined)).find(Boolean), [msgs]);
  const preview = useMemo(() => parseIntent(input, lastUrl ? { lastUrl } : {}), [input, lastUrl]);
  const typedSecret = useMemo(() => detectSecret(input, BIP39_WORDS), [input]);
  const history = useMemo(() => historyMode === "saved"
    ? savedHistory.map((item) => ({ id: item.id, prompt: item.prompt }))
    : [...new Set(msgs.filter((m) => m.role === "user").map((m) => m.text))].reverse().map((prompt) => ({ id: prompt, prompt })),
  [historyMode, savedHistory, msgs]);
  const selectHistory = (prompt: string) => {
    setInput(prompt);
    setHistoryOpen(false);
  };
  const startNewChat = () => {
    setMsgs([]);
    setInput("");
    setHistoryOpen(false);
  };
  const active = useMemo(() => [...msgs].reverse().find((m) => m.result && (m.result.intent.kind === "swap" || m.result.intent.kind === "inspect" || m.capId)), [msgs]);

  const push = (m: Omit<Msg, "id">) => { const id = ++seq.current; setMsgs((p) => [...p, { ...m, id }]); return id; };
  const patch = (id: number, p: Partial<Msg>) => setMsgs((all) => all.map((m) => (m.id === id ? { ...m, ...p } : m)));

  async function saveHistoryPrompt(prompt: string) {
    const authenticated = await historyReadyRef.current;
    if (!authenticated) return;
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ prompt }),
      });
      const body = await response.json() as { item?: HistoryItem; error?: string };
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
      const result = await response.json() as { deleted?: boolean; deletedCount?: number; error?: string };
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
      const result = await post<ParseResult>("/api/intent", { text, context: lastUrl ? { lastUrl } : {} });
      const i = result.intent;
      void saveHistoryPrompt(text);
      const id = push({ role: "banker", text: i.kind === "clarification" ? i.question : i.kind === "chat" ? "I can quote swaps, inspect links before you connect, and (soon) run capped burner tasks. What would you like?" : "Here’s how I read that.", result, ...(CAP_FOR[i.kind] ? { capId: CAP_FOR[i.kind]! } : {}) });
      if (i.kind === "swap") patch(id, { quote: await post<QuoteResult>("/api/quotes", { intent: i }) });
      if (i.kind === "inspect") patch(id, { inspect: await post<InspectResponse>("/api/inspect", { url: i.url }) });
    } catch (e) {
      if (e instanceof ApiError && e.code === "SECRET_DETECTED") {
        patch(userMsgId, { text: REDACTED }); // seed phrase terdeteksi server: hapus dari transkrip
        push({ role: "banker", text: e.message });
        return;
      }
      push({ role: "banker", text: `That didn’t go through: ${e instanceof Error ? e.message : "unknown error"}. Nothing was executed.` });
    } finally { setBusy(false); }
  }

  const kindTone = preview.intent.kind === "clarification" ? "text-peach" : "text-lilac";

  return (
    <div className="flex h-[100svh] flex-col">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3 text-sm">
        <div className="flex items-center gap-4"><Link href="/"><Logo /></Link><span className="chip hidden sm:inline-flex"><i className="h-2 w-2 rounded-full bg-mint" />Robinhood Chain</span></div>
        <div className="flex items-center gap-4">
          <button
            ref={historyTriggerRef}
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label={`Open chat history (${history.length})`}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            className="text-sm text-white/70 hover:text-white lg:hidden"
          >
            History <span className="text-white/40">({history.length})</span>
          </button>
          <WalletBalances />
          <SessionStatus />
          <Link href="/docs" className="hidden text-white/70 hover:text-white sm:inline">Docs</Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[230px_minmax(0,1fr)_340px]">
        {/* LEFT RAIL */}
        <nav className="hidden overflow-y-auto border-r border-white/8 p-4 text-sm lg:block" aria-label="Chats and history">
          <button type="button" onClick={startNewChat} className="btn btn-ghost mb-5 w-full">New chat</button>
          <HistoryContent
            history={history}
            savedHistory={savedHistory}
            mode={historyMode}
            error={historyError}
            action={historyAction}
            onSelect={selectHistory}
            onDelete={confirmDeleteHistoryItem}
            onClear={confirmClearSavedHistory}
          />
        </nav>

        {historyOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close chat history"
              className="absolute inset-0 bg-black/65"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-history-title"
              className="relative flex h-full w-[min(22rem,88vw)] flex-col overflow-y-auto border-r border-white/10 bg-panel p-4 shadow-2xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 id="mobile-history-title" className="font-semibold">Chat history</h2>
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
              <button type="button" onClick={startNewChat} className="btn btn-ghost mb-5 w-full">New chat</button>
              <HistoryContent
                history={history}
                savedHistory={savedHistory}
                mode={historyMode}
                error={historyError}
                action={historyAction}
                onSelect={selectHistory}
                onDelete={confirmDeleteHistoryItem}
                onClear={confirmClearSavedHistory}
              />
            </aside>
          </div>
        )}

        {/* CENTER */}
        <main className="flex min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6">
            {msgs.length === 0 ? (
              <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
                <Banker pose="wave" className="h-56 w-auto" />
                <h1 className="h-display mt-2 text-4xl">What would you like to do?</h1>
                <p className="mt-3 text-sm text-white/55">Type it the way you’d say it. I’ll show how I read it before anything runs.</p>
                <ul className="mt-5 flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => (<li key={s}><button type="button" className="chip" onClick={() => setInput(s)}>{s}</button></li>))}</ul>
              </div>
            ) : (
              <ol className="mx-auto max-w-2xl space-y-4">
                {msgs.map((m) => (
                  <li key={m.id} className={`step-in flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "banker" && <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full glass"><Mark size={18} /></span>}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-white/10" : "glass"}`}>
                      <p>{m.text}</p>
                      {m.result && m.result.intent.kind !== "chat" && m.result.intent.kind !== "clarification" && <p className="mt-2 rounded-lg bg-white/[.05] px-3 py-2 text-xs text-lilac">{m.result.label}</p>}
                      {m.result?.intent.kind === "clarification" && m.result.intent.choices && (
                        <div className="mt-3 flex flex-wrap gap-2">{m.result.intent.choices.map((c) => (<button key={c} type="button" className="chip" onClick={() => void send(c)}>{c}</button>))}</div>
                      )}
                      {m.capId && <CapNote id={m.capId} />}
                      {m.quote && <p className="mt-2 text-xs text-white/60">{m.quote.message} <button type="button" className="underline lg:hidden" onClick={() => setSheet(true)}>Open review</button></p>}
                      {m.inspect && <p className="mt-2 text-xs text-white/60">Passive check done. <button type="button" className="underline lg:hidden" onClick={() => setSheet(true)}>See findings</button></p>}
                    </div>
                  </li>
                ))}
                {busy && <li className="pl-11 text-xs text-white/40 pulse-soft">Reading…</li>}
                <div ref={endRef} />
              </ol>
            )}
          </div>

          <form className="border-t border-white/8 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <div className="mx-auto max-w-2xl">
              <p aria-live="polite" className={`mb-2 min-h-[1.25rem] truncate text-xs ${kindTone}`}>{typedSecret ? <span className="text-coral">{secretMessage(typedSecret)}</span> : input.trim() ?<><span className="text-white/40">I read this as: </span>{preview.label}</> : <span className="text-white/35">{preview.label}</span>}</p>
              <div className="glass flex items-end gap-2 rounded-2xl p-2">
                <label htmlFor="composer" className="sr-only">Your request</label>
                <textarea id="composer" rows={1} value={input} maxLength={500} placeholder="Swap 100 USDG to ETH…" onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }}
                  className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/35" />
                <button type="button" aria-disabled="true" aria-pressed={privNote} onClick={() => setPrivNote((v) => !v)} title="Private submission" className="chip !h-10 shrink-0 cursor-not-allowed opacity-60"><IconLock className="h-3.5 w-3.5" /> Private</button>
                <button type="submit" disabled={busy || !input.trim() || !!typedSecret} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-ink transition-opacity disabled:opacity-40"><IconArrow className="h-4 w-4" /></button>
              </div>
              {privNote && <p className="mt-2 text-xs text-white/50">{PRIVATE_COPY}</p>}
              <p className="mt-2 text-[11px] text-white/30">Enter sends · Shift+Enter adds a line. Nothing moves without your wallet confirmation.</p>
            </div>
          </form>
        </main>

        {/* RIGHT PANEL (bottom sheet on mobile) */}
        <aside aria-label="Review" className={`fixed inset-x-0 bottom-0 z-40 max-h-[78svh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-panel p-5 transition-transform duration-300 lg:static lg:max-h-none lg:translate-y-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-transparent ${sheet ? "translate-y-0" : "translate-y-full"}`}>
          <div className="mb-3 flex items-center justify-between lg:hidden"><span className="text-sm font-semibold">Review</span><button type="button" className="text-sm text-white/60" onClick={() => setSheet(false)}>Close</button></div>
          <Panel msg={active} />
        </aside>
      </div>
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
}: {
  history: HistoryEntry[];
  savedHistory: HistoryItem[];
  mode: HistoryMode;
  error: string;
  action: string | null;
  onSelect: (prompt: string) => void;
  onDelete: (item: HistoryItem) => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs text-white/40">Recent requests</h2>
        {mode === "saved" && savedHistory.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={action !== null}
            className="text-[11px] text-white/45 hover:text-peach disabled:opacity-50"
          >
            {action === "clear-all" ? "Clearing…" : "Clear all"}
          </button>
        )}
      </div>
      {history.length === 0 ? <p className="text-xs text-white/35">{mode === "saved" ? "Your saved requests will appear here." : "Your requests from this session show up here. Sign in to save them."}</p> : (
        <ul className="space-y-1">{history.slice(0, 20).map((item) => {
          const savedItem = mode === "saved" ? savedHistory.find((entry) => entry.id === item.id) : undefined;
          return (
            <li key={item.id} className="flex items-center gap-1">
              <button type="button" onClick={() => onSelect(item.prompt)} className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-white/70 hover:bg-white/[.06]">{item.prompt}</button>
              {savedItem && (
                <button
                  type="button"
                  onClick={() => onDelete(savedItem)}
                  disabled={action !== null}
                  aria-label={`Delete saved request: ${savedItem.prompt}`}
                  className="shrink-0 rounded px-2 py-1 text-xs text-white/35 hover:text-peach disabled:opacity-50"
                >
                  {action === savedItem.id ? "…" : "×"}
                </button>
              )}
            </li>
          );
        })}</ul>
      )}
      {mode === "error" || error ? <p role="status" className="mt-2 text-[11px] text-peach">{error || "Saved history is temporarily unavailable."}</p> : null}
      <p className="mt-6 text-[11px] leading-relaxed text-white/30">{mode === "saved" ? "Saved to your account. Select a request to put it in the composer." : "Preview history lives in this tab only."}</p>
    </>
  );
}

function CapNote({ id }: { id: string }) {
  const c = capabilityById(id);
  if (!c) return null;
  return <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60"><StatusChip status={c.status} /> {c.label}: {c.note} Nothing was started.</p>;
}

function Row({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return <div className="flex justify-between gap-3 border-t border-white/5 py-2 text-sm"><dt className="text-white/50">{k}</dt><dd className={dim ? "text-white/35" : "font-medium"}>{v}</dd></div>;
}

function Panel({ msg }: { msg: Msg | undefined }) {
  const intent = msg?.result?.intent;
  if (!msg || !intent) {
    return <div className="text-sm text-white/45"><h2 className="mb-2 font-semibold text-white/70">Review</h2>Quotes, safety findings and fee breakdowns appear here. You’ll always see amounts, destination and approval scope before anything is signed.</div>;
  }
  if (intent.kind === "swap") {
    const out = findAsset(intent.tokenOut), tin = findAsset(intent.tokenIn);
    const routes = msg.quote?.routes ?? [];
    return (
      <div className="step-in">
        <h2 className="mb-1 font-semibold">Swap review</h2>
        <p className="mb-3 text-xs text-lilac">{msg.result?.label}</p>
        <dl>
          <Row k="You pay" v={`${intent.amountIn} ${intent.tokenIn}`} />
          <Row k="You receive" v={routes[0] && out ? `${formatUnits(BigInt(routes[0].expectedOutBaseUnits), out.decimals)} ${out.symbol}` : `— ${intent.tokenOut}`} dim={!routes[0]} />
          <Row k="Min received" v={routes[0] && out ? `${formatUnits(BigInt(routes[0].minOutBaseUnits), out.decimals)} ${out.symbol}` : "—"} dim={!routes[0]} />
          <Row k="Max slippage" v={`${((intent.slippageBps ?? 50) / 100).toString()}%${intent.slippageBps ? "" : " (default)"}`} />
          <Row k="Venue" v={routes[0]?.provider ?? "—"} dim={!routes[0]} />
          <Row k="Fees · impact · gas" v="—" dim />
          <Row k="Quote expires" v="—" dim />
          <Row k="Submission" v={intent.privateRequested ? "Private requested" : "Public"} />
        </dl>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs leading-relaxed text-white/65">
          <div className="mb-1"><StatusChip status="planned" /></div>
          {msg.quote ? msg.quote.message : "Looking for executable routes…"}
          {(tin?.status === "unverified" || out?.status === "unverified") && <p className="mt-2 text-white/45">Token addresses are not verified yet, so no quote can be requested and nothing here is a price.</p>}
        </div>
        <button type="button" disabled className="btn btn-primary mt-4 w-full opacity-50">Sign in your wallet</button>
        <p className="mt-2 text-center text-[11px] text-white/35">Signing is not connected in this build. Nothing can execute.</p>
      </div>
    );
  }
  if (intent.kind === "inspect") {
    const r = msg.inspect?.report;
    return (
      <div className="step-in">
        <h2 className="mb-1 font-semibold">Link check</h2>
        <p className="mb-3 text-xs text-lilac">{msg.result?.label}</p>
        {!r ? <p className="text-sm text-white/50">Checking…</p> : (
          <>
            <div className="mb-3 flex items-center gap-2"><span className={`status ${r.band === "dangerous" ? "status-unavailable" : r.band === "low concern" ? "status-verified" : "status-planned"} capitalize`}>{r.band}</span>{r.score !== null && <span className="text-xs text-white/50">score {r.score}/100</span>}</div>
            {r.findings.length === 0 ? <p className="text-sm text-white/55">No red flags in the checks that ran.</p> : (
              <ul className="space-y-2">{r.findings.map((f) => (<li key={f.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs"><div className="font-medium capitalize">{f.severity}: {f.title}</div><div className="mt-1 text-white/60">{f.evidence}</div>{f.uncertainty && <div className="mt-1 text-white/40">Unknown: {f.uncertainty}</div>}</li>))}</ul>
            )}
            <h3 className="mb-1 mt-4 text-xs text-white/40">Checks run</h3>
            <ul className="space-y-1 text-xs text-white/70">{r.checksRun.map((c) => <li key={c}>✓ {c}</li>)}</ul>
            <h3 className="mb-1 mt-4 text-xs text-white/40">Not run yet</h3>
            <ul className="space-y-1 text-xs text-white/50">{r.checksUnavailable.map((c) => <li key={c}>– {c}</li>)}</ul>
            <p className="mt-4 text-[11px] leading-relaxed text-white/40">{r.disclaimer}</p>
          </>
        )}
      </div>
    );
  }
  const cap = msg.capId ? capabilityById(msg.capId) : undefined;
  return cap ? <div className="step-in"><h2 className="mb-2 font-semibold">{cap.label}</h2><StatusChip status={cap.status} /><p className="mt-3 text-sm text-white/60">{cap.note}</p></div> : null;
}
