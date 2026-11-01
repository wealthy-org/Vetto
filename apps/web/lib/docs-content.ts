export interface DocSection { id: string; group: string; title: string; paragraphs: string[]; bullets?: string[] }

/** In-app /docs copy (brief §21), kept as data so it can move to a CMS or MDX without touching the layout. */
export const DOCS: DocSection[] = [
  { id: "what-is-vetto", group: "Start", title: "What is Vetto?",
    paragraphs: [
      "Vetto is a natural-language DeFi assistant for Robinhood Chain. Say what you want (swap, inspect a dApp, hand off a mint or claim, open an isolated browser) and Vetto works out the steps.",
      "One principle does not bend: Vetto never moves your funds without your explicit approval. Every transaction is signed by you, in your own wallet.",
    ],
    bullets: ["Not an autonomous trader with open access to your wallet", "Not a ZK dark pool", "Not a guarantee of safety", "Never asks for a main-wallet seed phrase or private key"] },
  { id: "how-it-works", group: "Start", title: "How it works",
    paragraphs: ["Every request follows the same path, and there is a pause you control at each step. Nothing runs in the background."],
    bullets: ["Sign in", "Ask in plain language", "Vetto shows how it read your request (the line above the composer)", "It finds real options. Numbers are never invented", "Simulation and safety checks run", "You review amounts, destination and approval scope", "You approve in your own wallet", "You get a receipt and history"] },
  { id: "swaps", group: "Features", title: "Swaps",
    paragraphs: [
      "Type something like “swap 10 USDG to ETH”. If anything is ambiguous, such as a missing destination token, Vetto asks. It never guesses a token contract.",
      "Only routes that can actually execute are shown, from one to five depending on what exists. Each card lists amount in and out, minimum received, fees, price impact, venue, allowance, estimated gas and quote expiry. Slippage defaults to 0.5% and is editable.",
    ] },
  { id: "private-submission", group: "Features", title: "Private submission",
    paragraphs: [
      "When a relay that genuinely supports Robinhood Chain is connected, your transaction skips the public mempool until it is included. That is all it does.",
      "It is not ZK privacy. After confirmation your wallet, amount and tokens are public on the explorer, relay operators can see pending flow, and there is no blanket MEV immunity. If no verified relay exists, the switch is off and says so.",
    ] },
  { id: "dapp-checker", group: "Features", title: "dApp safety checker",
    paragraphs: [
      "Paste a link. Vetto runs passive checks first. When the sandbox is enabled, it visits the site on a single-use machine with a throwaway wallet holding nothing of value, captures every approval, signature and network request, and simulates what they would do.",
      "The passive check can flag blocked URL patterns, punycode, and one-character lookalikes of selected brands. These are heuristic signals, never a certification or proof of malicious intent. Today no target site is contacted; the report remains insufficient evidence because domain ownership, TLS, contracts and active behavior are not checked.",
    ] },
  { id: "agent-tasks", group: "Features", title: "Agent tasks (burner wallet)",
    paragraphs: ["Ask Vetto to mint or claim. It uses a separate burner wallet that you fund with a deliberately small, fixed amount, so the worst case is capped. Before anything runs you see the simulation, exact fees, target contract, expected output and approval scope."],
    bullets: ["Every fund-moving task needs your explicit approval", "Unlimited approvals are rejected by default", "Failures and timeouts are reported plainly: never success for something that only simulated"] },
  { id: "live-browser", group: "Features", title: "Live browser",
    paragraphs: ["One session is one isolated, single-use machine, not your browser. Watch the stream read-only, take control at any moment, and end the session to wipe everything. Sessions have rate limits and a time to live."] },
  { id: "wallets", group: "Security", title: "Sign-in and wallets",
    paragraphs: ["Depending on configuration you can use an external wallet or sign in with email, Google or X, which comes with an associated wallet."],
    bullets: ["Signing in is not permission to trade", "A session cookie is not signing capability", "Embedded or social wallets are labelled custodial"] },
  { id: "status", group: "Security", title: "What’s real, planned or unavailable",
    paragraphs: ["Each external capability carries a label. Verified means integrated and tested. Planned means not available yet. Unavailable means not supported on this chain right now. Vetto never shows a fake quote or route as if it were real. The live list is on the home page under “What’s live”."] },
  { id: "faq", group: "Reference", title: "FAQ",
    paragraphs: [
      "Can Vetto move my funds without approval? No. Every swap, mint and claim needs your confirmation through your own wallet.",
      "Does Private make a transaction untraceable? No. It only changes when the transaction reaches the public mempool.",
      "Does the safety score guarantee a site is safe? No. It reflects the checks that ran, and something can still be missed.",
      "Why a separate burner wallet? So a malicious dApp or a bug can cost you at most the small amount you funded.",
    ] },
];
