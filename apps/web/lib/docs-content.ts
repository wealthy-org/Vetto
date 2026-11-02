export interface DocSection { id: string; group: string; title: string; summary: string; paragraphs: string[]; bullets?: string[] }

/** In-app /docs copy (brief §21), kept as data so it can move to a CMS or MDX without touching the layout. */
export const DOCS: DocSection[] = [
  { id: "what-is-vetto", group: "Start", title: "What is Vetto?", summary: "Meet Vetto, a natural-language DeFi assistant built around explicit user approval.",
    paragraphs: [
      "Vetto is a natural-language DeFi assistant for Robinhood Chain. Say what you want (swap, inspect a dApp, hand off a mint or claim, open an isolated browser) and Vetto works out the steps.",
      "One principle does not bend: Vetto never moves your funds without your explicit approval. Every transaction is signed by you, in your own wallet.",
    ],
    bullets: ["Not an autonomous trader with open access to your wallet", "Not a ZK dark pool", "Not a guarantee of safety", "Never asks for a main-wallet seed phrase or private key"] },
  { id: "how-it-works", group: "Start", title: "How it works", summary: "Follow a request from sign-in through review, approval, and receipt.",
    paragraphs: ["The intended swap flow pauses for your review at every step. Today, Vetto can preview typed intents and run passive link checks; it does not yet quote or submit swaps. Nothing runs in the background."],
    bullets: ["Sign in with a supported EOA wallet when deployment is configured", "Ask in plain language", "Vetto shows how it read your request (the line above the composer)", "Unverified swap routes are not quoted", "Transaction simulation and wallet execution are not available yet", "Chat prompts can be saved to your history when signed in"] },
  { id: "swaps", group: "Features", title: "Swaps", summary: "Learn how Vetto interprets a swap request and presents executable routes.",
    paragraphs: [
      "Type something like “swap 10 USDG to ETH”. Vetto can preview the typed intent and asks when details are ambiguous; it never guesses a token contract.",
      "Live swap quotes and transaction execution are not available yet. The quote API returns no routes until token identity, an executable venue, and its transaction path are independently verified. When enabled, only real executable routes will be shown, with amount in/out, minimum received, fees, price impact, venue, allowance, estimated gas and quote expiry.",
    ] },
  { id: "private-submission", group: "Features", title: "Private submission", summary: "Understand what private transaction submission changes—and what it doesn't.",
    paragraphs: [
      "When a relay that genuinely supports Robinhood Chain is connected, your transaction skips the public mempool until it is included. That is all it does.",
      "It is not ZK privacy. After confirmation your wallet, amount and tokens are public on the explorer, relay operators can see pending flow, and there is no blanket MEV immunity. If no verified relay exists, the switch is off and says so.",
    ] },
  { id: "dapp-checker", group: "Features", title: "dApp safety checker", summary: "See what passive link checks can tell you, and where their limits are.",
    paragraphs: [
      "Paste a link. Vetto currently runs passive URL and DNS checks only; it does not visit the destination. An isolated sandbox scan is planned, not available. If built, it must use a single-use machine and throwaway wallet, capture approvals, signatures and network requests, and simulate their effects.",
      "The passive check can flag blocked URL patterns, punycode, and one-character lookalikes of selected brands. These are heuristic signals, never a certification or proof of malicious intent. Today no target site is contacted; the report remains insufficient evidence because domain ownership, TLS, contracts and active behavior are not checked.",
    ] },
  { id: "agent-tasks", group: "Features", title: "Agent tasks (burner wallet)", summary: "Learn how a separate, capped burner wallet could limit task risk.",
    paragraphs: ["Burner-wallet mint and claim tasks are not available. Any future implementation must use a separate user-controlled or securely provisioned wallet with a deliberately capped budget. Before anything runs, it must show a simulation, exact fees, target contract, expected output and approval scope."],
    bullets: ["Every fund-moving task needs your explicit approval", "Unlimited approvals are rejected by default", "Failures and timeouts are reported plainly: never success for something that only simulated"] },
  { id: "live-browser", group: "Features", title: "Live browser", summary: "Understand the planned isolated browser session model and its controls.",
    paragraphs: ["Isolated live browser sessions are not available. The planned design uses one isolated, single-use machine per session, a read-only stream with user takeover, and verified teardown with rate limits and a time to live."] },
  { id: "wallets", group: "Security", title: "Sign-in and wallets", summary: "See how signing in differs from granting permission to trade.",
    paragraphs: ["Wallet sign-in is available only when WalletConnect and the database are configured and supported by the deployment. Email, Google and X sign-in are not implemented. Signing in does not enable swaps or authorize transactions."],
    bullets: ["Signing in is not permission to trade", "A session cookie is not signing capability", "Embedded or social wallets are labelled custodial"] },
  { id: "status", group: "Security", title: "What’s real, planned or unavailable", summary: "Know what each capability status means before relying on a feature.",
    paragraphs: ["Each external capability carries a label. Verified means integrated and tested. Planned means not available yet. Unavailable means not supported on this chain right now. Vetto never shows a fake quote or route as if it were real. The live list is on the home page under “What’s live”."] },
  { id: "faq", group: "Reference", title: "FAQ", summary: "Quick answers about approvals, privacy, safety checks, and burner wallets.",
    paragraphs: [
      "Can Vetto move my funds without approval? No. Every swap, mint and claim needs your confirmation through your own wallet.",
      "Does Private make a transaction untraceable? No. It only changes when the transaction reaches the public mempool.",
      "Does the safety score guarantee a site is safe? No. It reflects the checks that ran, and something can still be missed.",
      "Why a separate burner wallet? So a malicious dApp or a bug can cost you at most the small amount you funded.",
    ] },
];
