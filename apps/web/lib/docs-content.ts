import type { CapabilityStatus } from "@vetto/quote-engine";
import { serverProfile } from "./chain-profile";
import { CAPABILITIES } from "@vetto/quote-engine";
import type { DocIconName } from "@/components/docs/doc-icons";

/** The chain this deployment documents, so the docs cannot contradict the app. */
const DOC_CHAIN = serverProfile();

/**
 * Docs copy lives here as typed blocks so the pages stay layout-only and the
 * text can move to MDX or a CMS later without touching components.
 *
 * Honesty rule for this file: nothing is described as working unless the
 * capability registry says it is. Where a label is uncertain, render one.
 */

export type DocBlock =
  | { k: "p"; text: string }
  | { k: "h2"; id: string; text: string }
  | { k: "h3"; text: string }
  | { k: "ul"; items: string[] }
  | { k: "hint"; tone: "info" | "tip" | "warn" | "danger"; text: string }
  | { k: "cards"; items: DocCard[]; muted?: boolean }
  | { k: "steps"; items: { title: string; body: string }[] }
  | { k: "table"; head: string[]; rows: string[][] }
  | { k: "prompt"; text: string }
  | { k: "facts"; items: { big: string; label: string; note?: string }[] }
  | { k: "capabilities" }
  | { k: "faq"; items: { q: string; a: string }[] };

export type DocCard = {
  title: string;
  body: string;
  href: string;
  icon: DocIconName;
  badge?: string;
};

export type DocPage = {
  id: string;
  group: string;
  title: string;
  /** Shown as a pill next to the page title. Only for pages about a single capability. */
  status?: CapabilityStatus;
  lead: string;
  icon: DocIconName;
  tocNote?: string;
  blocks: DocBlock[];
};

/** Sidebar order. The docs index is not in this list: it is the Welcome page itself. */
export const DOC_GROUPS = ["Introduction", "Features", "Reference"] as const;

export const DOC_PAGES: DocPage[] = [
  {
    id: "quickstart",
    group: "Introduction",
    title: "Quickstart",
    lead: "From a cold page to a reviewed swap in four steps. Nothing is signed until you approve it in your own wallet.",
    icon: "quickstart",
    tocNote: "Quotes are readable before you connect. Signing is opt-in per deployment.",
    blocks: [
      {
        k: "hint",
        tone: "info",
        text: `Vetto runs on ${DOC_CHAIN.name} (chain ID ${DOC_CHAIN.chainId}). Quotes come from Uniswap v4 pools on that chain — not from a simulation and not from fixture data.${DOC_CHAIN.isTestnet ? " This is a testnet deployment: the funds it moves have no value." : ""}`,
      },
      { k: "steps", items: [
        { title: "Open the app", body: "Go to /app. The landing page opens the same place; there is no separate sign-in step in the navigation." },
        { title: "Connect a wallet", body: "Phantom, MetaMask, Rabby, Coinbase Wallet, or any WalletConnect wallet. Sign-in is a signed message, not a transaction, and it does not authorize trading." },
        { title: "Say what you want", body: "Type a full sentence. A line above the composer shows how Vetto read it before you press Enter." },
        { title: "Review, then decide", body: "The right panel lists the routes that actually answered, the minimum you will receive, gas, and exactly what your wallet will be asked to approve." },
      ] },
      { k: "h2", id: "try-a-request", text: "Try a request" },
      { k: "p", text: "These are real prompts the parser accepts. Press *Try* and the sentence lands in the composer — it does not send itself." },
      { k: "prompt", text: "Swap 100 USDG to ETH" },
      { k: "prompt", text: "Swap 0.01 ETH to USDG" },
      { k: "prompt", text: "Is fastclaim-hood.xyz safe?" },
      { k: "h2", id: "what-happens-next", text: "What happens next" },
      { k: "ul", items: [
        "**Intent.** Vetto turns the sentence into a typed request. Ambiguous amounts are asked back, never guessed.",
        "**Quote.** Each route is a live read from a v4 pool; a route that did not answer is not shown.",
        "**Simulation.** The server rebuilds the payload, re-checks your balance and Permit2 allowance, and simulates it from your wallet.",
        "**Signature.** Only your wallet can sign. Vetto never holds a key.",
        "**Receipt.** Status changes to confirmed only when the chain returns a receipt for that transaction hash.",
      ] },
    ],
  },
  {
    id: "reading-you",
    group: "Introduction",
    title: "How Vetto reads you",
    lead: "Plain language in, a typed request out. The line above the composer always shows the interpretation first.",
    icon: "read",
    blocks: [
      { k: "p", text: "Vetto parses your sentence locally first and only asks a language model when the pattern is unclear. Whatever the path, the result is a validated object — never free-form code and never a wallet action." },
      { k: "h2", id: "what-it-understands", text: "What it understands" },
      { k: "table", head: ["You type", "Vetto reads it as"], rows: [
        ["Swap 100 USDG to ETH", "Swap, public submission, default 0.5% slippage"],
        ["swap 500 USDG to ETH privately", "Swap, private requested — which is reported as unavailable, not promised"],
        ["Is fastclaim-hood.xyz safe?", "Link check (passive URL and DNS only)"],
        ["Mint the NFT at nft-mint-pass.app max 0.01 ETH", "Capped burner task — labelled Planned, nothing runs"],
        ["Swap 2 USDG", "Clarification: which token do you want back?"],
        ["swap 1,5 ETH to USDG", "Clarification: ambiguous decimal separator"],
      ]},
      { k: "h2", id: "what-it-refuses", text: "What it refuses" },
      { k: "ul", items: [
        "A burner task **without a spend cap** is turned into a clarification instead of an agent task.",
        "Anything that looks like a seed phrase or private key is rejected before it is parsed, logged or stored.",
        "A token symbol is resolved from a fixed asset registry; Vetto never invents a contract address.",
      ] },
      { k: "hint", tone: "warn", text: "The interpretation line is a preview of the parse, not a promise that the action will run. The capability label decides that." },
    ],
  },
  {
    id: "swaps",
    group: "Features",
    title: "Swaps and routing",
    lead: "Every route comes from a v4 pool that actually answered. One route is a complete answer — the list is never padded.",
    icon: "swap",
    tocNote: "Verified: live quotes. Planned: signing, unless the operator opt-in is on.",
    blocks: [
      { k: "h2", id: "how-a-quote-is-made", text: "How a quote is made" },
      { k: "p", text: "Vetto asks the Uniswap v4 quoter on Robinhood Chain for each registered pool, keeps the pools that answered, and ranks them by what lands in your wallet after the pool fee and gas. A pool that reverts or times out is dropped, not filled in." },
      { k: "h2", id: "route-types", text: "Route types" },
      { k: "table", head: ["Route", "What it is", "Status"], rows: [
        ["Direct pool", "One pool, one hop — the only type in use today", "Verified"],
        ["Split route", "Splits the order across two pools", "Planned"],
        ["Intent solver", "Solvers compete to fill your order", "Planned"],
        ["Market-maker RFQ", "A maker locks a firm price for a few seconds", "Planned"],
        ["Private relay", "Keeps the order out of the public mempool", "Unavailable"],
      ]},
      { k: "p", text: "Planned types stay visible in this table so you can see the roadmap, but they never appear as a quote card. There is no fake route and no preview data." },
      { k: "h2", id: "reading-a-route-card", text: "Reading a route card" },
      { k: "ul", items: [
        "**You receive at least** — the minimum at your slippage, not an estimate you have to re-derive.",
        "**Pool fee** — the v4 fee tier that priced this route (for example 0.05%).",
        "**Price impact** — measured against a reference quote, shown as a percentage.",
        "**Network fee** — gas units times the chain's gas price at quote time.",
        "**Quote valid until** — after this the fingerprint no longer matches and the review is refused.",
      ] },
      { k: "prompt", text: "Swap 100 USDG to ETH" },
      { k: "h2", id: "before-you-sign", text: "Before you sign" },
      { k: "p", text: "The server rebuilds the transaction, re-reads a fresh quote from a second RPC endpoint, checks your balance and Permit2 allowance, and simulates the exact payload from your wallet address. If the minimum you reviewed is no longer reachable, the swap stops instead of degrading quietly." },
      { k: "hint", tone: "warn", text: "Simulation success is weaker evidence than a fork-based state diff. Vetto says so rather than upgrading the claim." },
    ],
  },
  {
    id: "permit2-approval",
    group: "Features",
    title: "Permit2 approvals",
    status: "planned",
    lead: "An approval is its own step with its own transaction. Vetto will not fold it into the swap or hide it behind a spinner.",
    icon: "key",
    blocks: [
      { k: "p", text: "Swapping an ERC-20 through the router needs an allowance first. Vetto treats that as a separate, visible step: what token, what spender, how much, and why." },
      { k: "h2", id: "what-you-see", text: "What you see" },
      { k: "ul", items: [
        "The exact token and the exact spender contract (Permit2), never a bare \"approve\".",
        "A bounded amount by default; an unlimited approval is flagged rather than pre-selected.",
        "A refusal when the allowance is still short. Vetto stops and says the approval has not landed yet instead of retrying silently.",
      ] },
      { k: "h2", id: "current-status", text: "Current status" },
      { k: "p", text: "The approval planner, the approval route and the review panel are implemented and tested, but the label stays **Planned**: no funded transaction has produced a receipt on chain yet. The route refuses to continue when the allowance is short, which is the honest outcome." },
      { k: "table", head: ["Part", "State"], rows: [
        ["Approval plan (token, spender, amount)", "Implemented, tested"],
        ["POST /api/execute/approve", "Implemented, fail-closed"],
        ["Funded approval on chain", "Not yet — blocks the Verified label"],
        ["Signing gate", "Off unless the operator opts in"],
      ]},
    ],
  },
  {
    id: "private-submission",
    group: "Features",
    title: "Private submission",
    status: "unavailable",
    lead: "No verified relay exists for this chain, so the switch is off and the app says so.",
    icon: "shield",
    blocks: [
      { k: "p", text: "Private submission only changes when your transaction reaches a public mempool. It does not hide your wallet, the amount, or the tokens after inclusion." },
      { k: "h2", id: "why-it-is-off", text: "Why it is off" },
      { k: "p", text: "A relay is only useful if it actually supports Robinhood Chain. None is verified today, so Vetto reports *unavailable* instead of routing orders into a service that would drop them or leak them." },
      { k: "h2", id: "what-it-would-and-would-not-do", text: "What it would and would not do" },
      { k: "table", head: ["Claim", "True?"], rows: [
        ["Order stays out of the public mempool until inclusion", "Yes, if a relay existed"],
        ["Wallets and amounts stay private forever", "No"],
        ["MEV immunity", "No blanket guarantee"],
        ["ZK privacy", "No — not this design"],
      ]},
      { k: "hint", tone: "danger", text: "Vetto never labels a transaction \"private\" or \"safe\". After confirmation, everything is public on the explorer." },
    ],
  },
  {
    id: "dapp-checker",
    group: "Features",
    title: "dApp safety checks",
    status: "verified",
    lead: "Passive URL and DNS checks today. No sandbox, no browser, no certification.",
    icon: "search",
    blocks: [
      { k: "p", text: "Paste a link and Vetto inspects the string and the DNS record. It does **not** visit the site. A domain that resolves cleanly can still be malicious, and the report says so." },
      { k: "h2", id: "what-runs", text: "What runs" },
      { k: "ul", items: [
        "Blocked-pattern checks on the URL shape.",
        "Punycode and mixed-script detection.",
        "One-character lookalikes of selected brand domains.",
        "DNS resolution, reported as an observation rather than a verdict.",
      ] },
      { k: "h2", id: "what-does-not-run-yet", text: "What does not run yet" },
      { k: "p", text: "An isolated sandbox that opens the site with a throwaway wallet, captures approvals and signatures, and simulates their effect is **planned**. It needs isolated per-session compute, so it is not part of today's build." },
      { k: "prompt", text: "Is fastclaim-hood.xyz safe?" },
      { k: "hint", tone: "warn", text: "A clean report is not a safety guarantee. It means the checks that ran found nothing — nothing more." },
    ],
  },
  {
    id: "agent-tasks",
    group: "Features",
    title: "Agent tasks (burner wallet)",
    status: "planned",
    lead: "Mint and claim tasks with a capped burner wallet. Parsed today, executed in Phase 3.",
    icon: "burner",
    blocks: [
      { k: "p", text: "Ask for a mint or a claim and Vetto will show how it read the request, then label the capability **Planned** and stop. Nothing is clicked, nothing is signed, no browser is opened." },
      { k: "table", head: ["Today", "Phase 3"], rows: [
        ["Intent parsed, cap required", "Same"],
        ["Capability reported as Planned", "Simulation, exact fees, target contract"],
        ["No site contact", "Isolated single-use machine"],
        ["No wallet action", "Capped burner wallet, never the main one"],
      ]},
      { k: "h2", id: "why-a-cap", text: "Why the cap comes first" },
      { k: "p", text: "A request without an explicit spend limit becomes a clarification. The cap is the only thing standing between a malicious page and an unbounded approval, so it is required before anything else is considered." },
      { k: "prompt", text: "Mint the NFT at nft-mint-pass.app max 0.01 ETH" },
      { k: "hint", tone: "info", text: "What the app shows for that prompt today: the interpretation line, the Planned chip, and the sentence \"Nothing was started.\"" },
    ],
  },
  {
    id: "live-browser",
    group: "Features",
    title: "Live browser",
    status: "planned",
    lead: "Watch the session, take the controls, and close it for good. Planned, not built.",
    icon: "browser",
    blocks: [
      { k: "p", text: "The design is one isolated, single-use machine per session: a read-only stream by default, explicit takeover, an activity log of every approval and signature, a session time to live, and verified teardown." },
      { k: "h2", id: "why-it-is-not-here", text: "Why it is not here" },
      { k: "p", text: "It needs isolated per-session compute and a burner wallet per session. That is Phase 3 infrastructure, so the capability stays **Planned** and the app never pretends to stream a screen it does not have." },
    ],
  },
  {
    id: "status",
    group: "Reference",
    title: "What's real, planned or unavailable",
    lead: "Every capability carries a label. Verified means integrated and tested here. Planned means not available yet. Unavailable means not supported on this chain right now.",
    icon: "status",
    blocks: [
      { k: "p", text: "The list below is generated from the same registry the app uses, so it cannot drift from what the interface shows. Three entries — approvals, transaction preparation and execution receipts — are implemented and tested; they report **Verified** only on a deployment that has swap execution enabled *and* a database for the execution record. On every other deployment they stay Planned, and the swap review says why." },
      {
        k: "hint",
        tone: "info",
        text: "Deploying the app does not add a relay, a solver, a market maker, a burner machine or an isolated browser. Those need a counterparty or compute that no deployment setting can create, so they stay Planned or Unavailable everywhere.",
      },
      { k: "h2", id: "capability-list", text: "Capability list" },
      { k: "capabilities" },
      { k: "h2", id: "what-the-labels-mean", text: "What the labels mean" },
      { k: "table", head: ["Label", "Meaning", "What you can rely on"], rows: [
        ["Verified", "Integrated and tested against the live chain", "The behaviour described here happens"],
        ["Planned", "Designed, sometimes implemented, not enabled", "Nothing runs; the app says so"],
        ["Unavailable", "Not supported on Robinhood Chain today", "The switch is off and visible"],
      ]},
      { k: "hint", tone: "info", text: "Signing is opt-in per deployment: an operator enables it only after a funded receipt test. Quotes stay readable either way." },
    ],
  },
  {
    id: "wallets",
    group: "Reference",
    title: "Sign-in and wallets",
    lead: "Signing in proves you hold the address. It is not permission to trade.",
    icon: "wallet",
    blocks: [
      { k: "p", text: `Sign in with a browser wallet — Phantom, MetaMask, Rabby, Coinbase Wallet — or WalletConnect with any wallet that supports chain ${DOC_CHAIN.chainId}. A wallet that does not know the chain is asked to add it once.` },
      { k: "h2", id: "what-sign-in-grants", text: "What sign-in grants" },
      { k: "ul", items: [
        "A session cookie tied to the address you proved you hold.",
        "Saved chat history, scoped to that address.",
        "Nothing else — no signing capability, no spending, no approvals.",
      ] },
      { k: "p", text: "Once signed in, the header shows the wallet you used and a truncated address such as `0x57f0…365e`. That label is display metadata; it is never an authorization input." },
      { k: "hint", tone: "tip", text: "Every swap is still confirmed inside your wallet. A session is not a signature." },
    ],
  },
  {
    id: "faq",
    group: "Reference",
    title: "Questions people actually ask",
    lead: "Short answers, no marketing.",
    icon: "faq",
    blocks: [
      { k: "faq", items: [
        { q: "Can Vetto move my funds without approval?", a: "No. Every swap needs your signature in your own wallet. There is no key on the server and no background signing." },
        { q: "Is a quote a promise?", a: "No. It is a live read that expires. Before signing, the server re-quotes and refuses if the minimum you reviewed is no longer reachable." },
        { q: "Does Private make me untraceable?", a: "No. Private submission would only delay when the transaction hits the public mempool. It is unavailable on this chain today." },
        { q: "Does a clean link check mean a site is safe?", a: "No. Vetto runs passive checks only and does not visit the site. Something can always be missed." },
        { q: "Why a separate burner wallet for tasks?", a: "So a malicious page or a bug can cost at most the small amount you funded — and never your main wallet." },
        { q: "Which chain is this?", a: `${DOC_CHAIN.name}, chain ID ${DOC_CHAIN.chainId}, gas in ETH. Token addresses come from a fixed registry, not from the page you pasted.` },
        { q: "Why is signing sometimes unavailable?", a: "Execution is opt-in per deployment. Until an operator runs a funded receipt test, the server refuses to prepare a signable payload and says why." },
        { q: "Why does it say free-form parsing is off?", a: "The optional AI parser is configured with an operator key. When that provider rejects the key (or is rate-limited), Vetto skips it and keeps going with the built-in parser: swaps like “swap 0.1 ETH to USDG” and link checks still work, and the message says nothing was executed. The deployment health is reported as `llmParser` on `/api/capabilities`." },
        { q: "Does Vetto store my messages?", a: "Only when you are signed in, scoped to your address, and only the parsed request — never a seed phrase, which is rejected before parsing." },
      ] },
    ],
  },
];

export const DOC_BY_ID = new Map(DOC_PAGES.map((page) => [page.id, page]));

export const DOC_INDEX = DOC_PAGES.map((page) => ({
  id: page.id,
  title: page.title,
  group: page.group,
  lead: page.lead,
  icon: page.icon,
}));

export const docHref = (id: string) => `/docs/${id}`;

/** Sidebar entries, grouped. The Welcome page is prepended by the sidebar itself. */
export function docsByGroup() {
  return DOC_GROUPS.map((group) => ({
    group,
    pages: DOC_PAGES.filter((page) => page.group === group),
  })).filter((entry) => entry.pages.length > 0);
}

/** Verdict for a single capability id, straight from the registry. */
export function capabilityVerdict(id: string) {
  return CAPABILITIES.find((capability) => capability.id === id);
}

export const DOC_STATUS_LABEL: Record<CapabilityStatus, string> = {
  verified: "Verified",
  planned: "Planned",
  unavailable: "Unavailable",
};
