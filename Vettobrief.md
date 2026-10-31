# VETTO — Independent DeFi Banker Agent
## Developer Master Brief | Functional-Rebuild Target: Sotto Fi

**Version:** 0.1 · 28 October 2026  
**Working brand:** VETTO (not trademark/domain cleared)  
**Reference:** https://sottofi.com/docs and https://sottofi.com/  
**Target chain:** Robinhood Chain (matching the reference product; a Solana port is a different integration scope)  
**Primary request:** Rebuild the *documented product workflows* of Sotto under an independent brand and codebase, with production-grade security and a closely comparable user journey.  
**Working positioning:** “Your DeFi banker. Every move checked.”

> **Source boundary.** This document records what Sotto publicly **describes**, not a claim that all of its features are live, audited, production-safe, or available through public APIs. Actual live route coverage, relay availability, auth provider stack, execution contracts, and app visuals require independent testing. All new software, text, logo, character, and assets must be independently created or appropriately licensed. Do not represent VETTO as Sotto or an official affiliate.

---

## 1. Product definition

VETTO is a **natural-language DeFi execution assistant** for Robinhood Chain. Users can ask it to quote/exchange assets, inspect a dApp before visiting, perform a mint/claim using an explicitly funded low-balance wallet, or open a remotely isolated browser session. The product turns free-form input into a typed *intent*, performs checks, shows results/options, and **never authorizes spending without a clear user-confirmation step**.

**Core loop:**

```text
SIGN IN
  → ASK IN NATURAL LANGUAGE
  → INTENT PARSER (with a visible interpretation line)
  → DISCOVER REAL OPTIONS / ANALYZE TARGET
  → SIMULATE + SAFETY POLICIES
  → REVIEW
  → EXPLICIT USER APPROVAL
  → EXECUTE THROUGH USER-APPROVED SIGNING PATH
  → RECEIPT + HISTORY
```

VETTO is **not** (1) an autonomous trader with unlimited access; (2) a ZK dark pool; (3) a blanket guarantee of safety; or (4) a service that should accept a main-wallet seed phrase/private key.

---

## 2. Reference feature matrix (source-derived)

| Module | Sotto docs describe | VETTO target | Status / implementation requirement |
|---|---|---|---|
| Sign-in | Email, Google, X, or wallet; non-wallet logins receive a wallet | Equivalent options | Auth providers optional at initial launch; never silently create custody |
| Chat-centric UX | One input instead of feature-tab navigation | Equivalent intent-based UX | Required from V1 |
| Interpret preview | Label above input indicates understood task and context | Preview parsed intent | Required from V1 |
| Context/follow-ups | Remembers referenced site / last action | Scoped conversation context | Required from V1 |
| Route comparison | Shows 2–5 **available** routes, ranked by actual received output | Dynamic quote engine | Show only real executable quotes |
| Direct pool | Trade through a single pool | v4 route adapter | V1 executable |
| Split route | Splits among two pools | Multi-path optimizer + executor | Later once verified, not fake |
| Intent solver | Competing solver quotes / gas sponsorship | External solver/intent integration | Later, dependent on actual counterparties |
| Private route | Private relay, hidden pre-inclusion | Optional private submission adapter | Only enable after verifying supported chain pathway |
| Market maker | Firm RFQ price for ~30s | RFQ integration | Later when maker exists |
| Slippage display | Shows min-out, default 0.5% in docs | Editable max slippage / min-out | Required |
| dApp check | Fresh isolated machine/wallet, capture approvals/signatures/network requests, simulate | Sandbox browser + risk engine | Safety preview first; full sandbox later |
| Safety score | 80+ low risk, 50–79 caution, 0–49 dangerous | Transparent explainable score | Never promise zero risk |
| Agent tasks | Mint/claim from a burner, simulate then execute | Limited workflow runner | Later, heavily restricted |
| Live browser | Stream session, user takeover, stop/wipe | Remote browser session | Later, isolated environment |
| Private mode | Relay keeps pending order out of public mempool | Privacy of submission only | Never call anonymous/fully private |
| Tokenomics | Token on Pons; 2/2 tax, revenue distribution, holder discount | Separate token design decision | **Not required for product MVP** |
| Lending/bridging/staking | Listed as coming soon | Optional roadmap | Not a launch requirement |
| Intent API | Example typed JSON intent endpoint | Typed parser contract | Sotto labels format page **Planned** |

**Source links:**
- https://sottofi.com/docs
- https://sottofi.com/docs/quickstart
- https://sottofi.com/docs/reading-you
- https://sottofi.com/docs/swaps
- https://sottofi.com/docs/private-mode
- https://sottofi.com/docs/safety-checks
- https://sottofi.com/docs/agent-tasks
- https://sottofi.com/docs/live-browser
- https://sottofi.com/docs/burner-wallets
- https://sottofi.com/docs/intent-format
- https://sottofi.com/docs/tokenomics

---

## 3. Scope and delivery order

**Target: full documented feature parity, delivered in honest stages.** V1 must *work*, not just imitate the visuals.

### Phase 0 — Verification & product shell
- Validate Robinhood Chain RPC, wallet connection and token addresses via trusted official sources.
- Confirm which v4 pools/routes are real and liquid; check available v4 universal routing/settlement infrastructure.
- Verify private transaction endpoint/provider **for Robinhood Chain**, do not assume Ethereum private relays work on the target L2.
- Validate available ephemeral-browser infrastructure with session isolation and user take-control capability.
- Build authentic interface mock matching the reference information architecture but with original brand, graphics and copy.
- Write integration matrix with `verified`, `unsupported`, `planned`, `blocked` statuses.

### Phase 1 — Real transaction MVP
- Wallet sign-in, optional social sign-in with secure wallet linkage.
- Natural-language typed-intent parsing; visible intent preview; clarification on ambiguous amount/token/action.
- Token allowlist/registry; balances; real quotes for a **single executable venue** (v4 where supported).
- Review panel: amount in/out, min received, fees, price impact, venue, allowance, gas, route validity and quote expiry.
- Simulation + approval check; user signs via their wallet; actual onchain transaction; confirmed receipt and explorer link.
- Transaction and chat histories; basic safe link inspection **without live website interactions**.
- **No fake 'best of five' listing** if only one real quote exists.

### Phase 2 — Routing parity & safety
- Routing adapter for multiple pools; route comparison from independently executable, live quotes.
- Split-routing (only when router executable), solver/RFQ integration if actual partners exist.
- Dedicated risk pipeline for token approvals, verified contracts, spender reputation signals, simulation asset deltas and suspicious website redirects.
- Risk report with severity, evidence and uncertainty. Block obviously dangerous approvals by policy unless an explicitly approved policy exception exists.
- Private relay mode only if integration verified; show `Unavailable on this chain` otherwise.

### Phase 3 — Isolated browser and agent tasks
- One isolated browser session per task on isolated compute, instrumented for RPC requests, approvals, attempted downloads/navigation and transaction calls.
- Fresh expendable low-balance test wallet for safety checks.
- Burner-funded mint/claim workflows through narrow allowlisted actions; independent approvals, preflight simulation and explicit one-time user sign-off.
- Live read-only stream + user takeover + stop/wipe session; rate limits, environment teardown, no saved browser secrets.

### Phase 4 — Ecosystem extensions
- Broader tokenized-stock universe with asset session/transfer restrictions and quote availability checks.
- Lending/staking/bridging only after explicit partner review and independent risk limits.
- Developer SDK, audit logs, optionally token holder discount and independently designed protocol economics.

---

## 4. Brand and UI guidance

**Working name:** `VETTO` (one possible expansion: *Verified Execution and Transaction Tool*; optional, not necessary in branding). Alternate working names: `COVO`, `MOTTO`, `NIVO`. No uniqueness or availability claim.

**Visual goal:** reference Sotto's *UX structure* and calm character-driven editorial feel; create independently authored design and avatar. Do not copy their proprietary illustrations, masks, logos, distinctive original prose, icons, code or brand personality verbatim.

### App information architecture

```text
HEADER:  VETTO | Robinhood Chain | Wallet / Account | Docs

LEFT RAIL: Chats / History / Recent tasks

CENTER: Original VETTO character / chat transcript / intent preview
        Prompt composer + suggested commands + safety/private controls

IN-CONTEXT CARDS:
        Route comparison (when swapping)
        Website risk findings (when inspecting)
        Agent task run (when mint/claim)
        Isolated browser stream (when browsing)

RIGHT PANEL (contextual):
        Selected quote / review + fee breakdown / confirmation
        OR risk evidence
        OR live action timeline

CONFIRMATION: clear asset deltas + destination + approval scope

POST EXECUTION: receipt, tx hash, status, exact amounts
```

Landing page sections: Hero → interactive command suggestions → swaps → private submission → dApp checks → burner agent tasks → live browser → how wallet security works → chain/token info → FAQ.

Mobile: chat first, cards slide over conversation; right panel becomes bottom sheet. Preserve readable typography. Use Next.js + TypeScript + Tailwind; motion selectively with GSAP where it adds narrative clarity. Do not over-animate signing/safety confirmations.

**Source fidelity note:** Documentation describes *function hierarchy* and some layout (route cards in front, breakdown to right, live browser bar). Exact pixel-perfect app layout is **not verifiable from text documents alone**. Require captured screenshots/video or direct access before assigning pixel-level acceptance criteria.

---

## 5. Natural-language intent engine

Architecture:

```text
user prompt
→ deterministic preprocessing
→ LLM parsing to strict schema (structured output)
→ schema validation and normalization
→ asset address / chain resolution
→ risk & ambiguity checks
→ deterministic execution planning
→ user preview
```

Example typed intent:

```typescript
type Intent =
  | {kind: 'swap'; chainId: 4663; tokenIn: string; tokenOut: string;
     amountIn: string; privateRequested: boolean; slippageBps?: number}
  | {kind: 'inspect'; url: string}
  | {kind: 'agent-task'; url: string; action: 'mint'|'claim'; maxSpend: string}
  | {kind: 'live-browser'; url?: string; action: 'start'|'take-control'|'end'}
  | {kind: 'clarification'; question: string; choices?: string[]}
  | {kind: 'chat'; text: string};
```

Do not use floating-point math for token amount calculations. Use base units + BigInt / fixed decimal.

**LLM is untrusted input interpretation, not an execution authority.** Never let raw LLM text choose arbitrary contract calls, wallet addresses, spender allowances or signing payloads without deterministic validation. Reject chain mismatch, unknown asset, ambiguous unit, unknown action. Prompt-injection from external dApps/webpages must not influence spending authority.

Context storage may remember `lastUrl`, `lastPair`, `pendingIntent`, `sessionId` but must not remember secret material.

---

## 6. Swap route engine

### Normalized quote schema

```typescript
type RouteQuote = {
  quoteId: string;
  routeType: 'direct'|'split'|'solver'|'private'|'rfq';
  provider: string;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  networkFeeEstimate: string;
  protocolFeeEstimate: string;
  priceImpactBps?: number;
  executableUntil: string;
  executionPathId: string;
  isExecutable: boolean;
  verifiedPrivacyRelay?: boolean;
};
```

Real-time venue registry must not invent venue prices. Quote engine should fetch **executable** paths, estimate all-in net output, filter expired/unsupported routes, simulate viable paths, rank by net output (tie-breaks: risk/latency), and display 1–5 depending on actual availability.

Reference Sotto docs describe route types: split, intent solver, shield/private relay, direct pool, market maker; suggested eligibility thresholds include split ≥$1,000, solver ≥$100, market maker stocks or ≥$5,000. These are **reference-product claims**, not universal venue limits or VETTO constants.

Execution must enforce exact spender/permit scope, slippage min-out, deadline, token addresses, recipient, and route fingerprint; revalidate a stale quote before submission.

---

## 7. Private mode — precise definition

Only promise **pre-inclusion order-flow protection** if an actual Robinhood-compatible private relay accepts transactions and they are not also sent to the public mempool by our own infrastructure.

This is **not ZK privacy**. Onchain wallet, transaction amount, tokens and recipients remain public once included. Relay operators may see pending flow. No blanket MEV immunity.

UI copy: `Private submission is available when the connected relay supports this network. Your transaction becomes public after confirmation.`

Toggle disabled when no verified provider exists. No fake 'private' route cards.

---

## 8. dApp safety checker

Sotto documents: fresh sealed computer/wallet; visit site; attempt representative connect/mint/claim actions; capture approvals, signatures, contract verification, domain freshness, network requests and simulated asset delta; report score ranges 80+, 50–79, 0–49.

VETTO pipeline:

1. URL normalization & strict host allow/deny policy: reject localhost, internal IPs, link-local, metadata services, DNS rebinding and redirected private ranges.
2. Passive checks: TLS, domain registration signals (when obtainable), known impersonation patterns, verified contract metadata, wallet-connection scripts, suspicious permissions.
3. Active isolated run: ephemeral VM/container, hardened Chromium, test-only wallet funded with **no valuable assets**; access through controlled proxy; detailed capture of wallet RPC and signature payloads; time/CPU/network limits.
4. Simulate attempted transactions on chain state, log all balance/approval deltas and unlimited approvals; compare observed vs claimed actions.
5. Risk report: `low concern`, `caution`, `dangerous`, or `insufficient evidence`; cite evidence and limitations. A score is heuristic, never a safety certification.
6. Destroy session, browser profile, ephemeral test wallet and machine image/keys; retain only minimal redacted audit metadata under a privacy policy.

**Never** run arbitrary third-party websites on the same host/network permissions as production wallets, LLM secrets, database, or signing services. Sandboxed browser pages are hostile code.

---

## 9. Burner wallet & task signing model

**No main-wallet secret collection.** The reference docs describe giving Sotto a low-balance burner key for remote task execution; VETTO should adopt a safer permissioned design.

Preferred:
- User explicitly creates/funds a dedicated **burner** for the specific task, via secure key provisioning or wallet-controlled account. Do not ask them to paste seed phrases or private keys into the chatbot.
- If server-side signing is unavoidable, use a well-audited non-exportable signer / hardened enclaved signer with strict policy, short TTL, spent funds ceiling, transaction allowlist and destruction proof/logging. Do not claim no one can access key unless architecture makes this true.
- All mint/claim operations require simulation, exact fees, target contract, output and spender approval shown to user. An approval token or wallet prompt is required for every money-moving task as specified by product policy.
- Reject upgrades to unlimited approvals. Treat unknown contract behavior as high risk.
- Confirm with a chain receipt and track task status; process may time out/revert without lying about success.

---

## 10. Isolated live browser

Components:
- Session manager (session creation, lease/TTL, permission states).
- Isolated browser fleet (one ephemeral process/container/microVM per task, isolated egress).
- Browser orchestrator (Playwright/CDP or equivalent).
- User view stream (low latency visual, separate control authority).
- Take-control / hand-back state machine.
- Instrumented wallet RPC proxy (allowlist, approval interception, transaction simulation).
- Teardown + verification / metrics.

Session states: `created → scanning → active-readonly → user-control → agent-control → ending → wiped`, plus `failed` and `expired`. Browser automation must be rate-limited and human-gated for actions that transfer assets.

Prevent: access to local/cloud metadata endpoints, persistent credential capture, open redirects to private network, unauthorized clipboard reading/secret exfiltration, cross-user session access, session replay and leaked browser URLs.

---

## 11. Authentication & wallets

Support (when configured): external injected wallet (WalletConnect, Rabby, etc.), email/OAuth social sign-in via audited auth provider, associated embedded wallet if provider supports chain and account model.

Critical UX constraints:
- Sign-in ≠ permission to trade.
- Session cookie ≠ signing capability.
- User confirmation required for execution.
- Clearly label any custodial or embedded wallet behavior.
- Protect wallet-link operations against identity swaps/session fixation.

---

## 12. Proposed stack

| Layer | Candidate | Notes |
|---|---|---|
| Web UI | Next.js App Router + TypeScript + Tailwind + motion libs | Responsive product UI |
| Wallet interaction | viem + wagmi / WalletConnect | Ensure Robinhood Chain support |
| Backend | Node/TypeScript API + worker queue (pg-boss, Postgres-backed) | Separate API from agent tasks; no Redis |
| AI parser | LLM API with strict JSON schema output | Never give signing authority |
| Chain | Robinhood RPC + explorer + indexer | Compare endpoints and reliability |
| Swaps | Uniswap v4 integration + supported routers | Executable quotes only |
| Simulation | Transaction simulation/fork RPC + ABI decoding | Validate approvals and deltas |
| Browser automation | Playwright + isolated per-task compute | No shared unrestricted workers |
| Streaming | WebRTC / low-latency stream proxy | Authenticated per-session controls |
| Storage | PostgreSQL only (NeonDB) — no Redis | Job queue via pg-boss; rate-limit/idempotency via Postgres tables; encrypt sensitive logs; TTL by class |
| Monitoring | Structured traces, transaction receipts, retries | Minimize user data retention |

**Do not assume:** available private-relay endpoint, solver/market-maker liquidity, complete account-abstraction support, or readily auditable Sotto source code.

---

## 13. Repository proposal

```text
vetto/
  apps/
    web/
    api/
    worker/
  packages/
    ui/
    intent-parser/
    asset-registry/
    wallet/
    quote-engine/
    swap-executor/
    transaction-simulation/
    safety-policy/
    browser-sessions/
    audit-types/
  contracts/
    README.md  # only if independently required
  infra/
    docker/
    isolated-browser/
    observability/
  docs/
    PRODUCT_SPEC.md
    INTEGRATION_MATRIX.md
    ROUTING_TRUTH_TABLE.md
    THREAT_MODEL.md
    CUSTODY_MODEL.md
    PRIVACY_DISCLOSURE.md
    SECURITY_TEST_PLAN.md
```

---

## 14. Internal APIs (suggested)

```text
POST /api/intent              text -> validated structured intent
POST /api/quotes              pair + amount -> executable routes
POST /api/simulate            selected unsigned route -> asset deltas
POST /api/execute/prepare     signed-in user -> unsigned payload for wallet
GET  /api/executions/:id      execution status + receipts
POST /api/inspect             url -> queued safety scan
GET  /api/inspections/:id     evidence + risk result
POST /api/tasks              mint/claim intent -> reviewed workflow
POST /api/browser/sessions    create isolated browser session
POST /api/browser/:id/control transfer control token
DELETE /api/browser/:id        end and wipe
GET  /api/history             recent conversations and transactions
```

Access control: authentication, per-account rate limiting, idempotency keys, origin and CSRF checks where relevant, replay protection, explicit action grants, authorization audit.

---

## 15. UX state machine

**Swap**: draft → parse → clarify if needed → quoting → route selected → revalidated → simulated → user confirmation → signature requested → pending → confirmed / reverted / expired.

**Inspect**: URL entered → passive checks → isolated run (if enabled) → evidence → qualified verdict → wipe.

**Agent task**: intent → task plan → burner funded → simulate → approve → execute → receipt → wipe.

**Live**: create → read-only stream → user takeover → hand-back → end → verified teardown.

Never show a `Confirmed` label before an actual onchain receipt at the defined confirmation threshold.

---

## 16. Acceptance criteria: meaningful clone parity

1. User types “swap 10 USDG to ETH”; intent preview displays exact assets, chain, amount and action before quote request.
2. If destination asset missing, assistant asks clarification; it never guesses a token contract.
3. Quote card shows *real* route from a provider, real min-out, valid gas/slippage and expiry.
4. User can reject/cancel without side effect.
5. Execution requires explicit wallet confirmation and corresponds exactly to reviewed route; approvals are exact/limited where possible.
6. Replacing calldata, recipient, spender, amount or selected route is detected and rejected.
7. Unexpected simulated token drain causes block/review warning.
8. Unknown site inspection handles SSRF redirects and cross-network attempts safely.
9. Risk explanation links to evidence and admits when a check is unavailable.
10. Optional private toggle disabled if no actual relay; status text discloses public onchain visibility.
11. Burner task cannot spend beyond funded balance / approved budget / target contract restrictions.
12. User takeover works only for the session owner and expires with the browser.
13. Exit/teardown invalidates stream, control token, test keys and worker environment.
14. Unit tests for typed intents, decimal precision, slippage, quote expiry, approvals, wallet linking, replay and signing policy.
15. Integration tests on testnet (if venue support) or local fork, then small-value controlled mainnet validation before wide public access.
16. UI has functional chat, cards, contextual review, history and coherent mobile state transitions.
17. Error messages never claim to have performed an action that only failed or was simulated.
18. Marketing never says private, safe, or gasless unless the selected route verifiably provides those properties.

---

## 17. Threat model — mandatory for launch

Threats: malicious dApp prompts, wallet drainer approvals, malicious router spender, LLM prompt injection, price manipulation, stale quotes, malicious RPC responses, browser sandbox escape, exfiltration of secrets, session fixation, auth bypass, phishing/lookalikes, API misuse, front-running, denial-of-service, cross-user tenancy leakage and payment abuse.

Required controls:
- User-wallet signing isolation and explicit confirmations.
- No main wallet seed/private key import.
- Spend/contract/recipient allowlists for tasks and policy-enforced approvals.
- RPC/provider redundancy for critical reads.
- Isolated sandbox, egress filtering, short TTL and complete teardown.
- Verified contract addresses + diff of token balance and allowance change.
- Strict content security policy, secure webhooks, dependency scanning, audit logs.
- Independent adversarial testing of browser security and custody model before public release.

---

## 18. Revenue and tokenomics: what is documented versus what is ours

**Sotto docs** state: 1B supply, launched/launching via Pons, 2% buy / 2% sell creator tax, tax split into three equal buckets (development, marketing, buyback/burn), 90% of application revenue directed to token (45% buyback/burn, 45% distributed holders), 10% retained; first month no Sotto fees and later 25% fee discount for holders of at least $10. These are statements from documentation—not a validated onchain revenue stream or payment implementation. The homepage snapshot also displays an inconsistent “0% of revenue” figure despite the 90% breakdown; verify before relying on it.

**VETTO**: Do not automatically reuse the name, ticker, tokenomics or purported tax/revenue distribution. Start with transparent route fees only after the transaction and security pipeline works. If launching a token, separately design revenue sources, verifiable accounting, fee vault, explicit eligibility rules, anti-wash controls and jurisdiction/legal review. Do not promise holder distributions without a reviewed compliance and implementation plan.

---

## 19. Major unknowns / validation checklist

- [ ] Can we access Sotto's actual app? Capture screens and user interactions; docs alone do not prove live execution.
- [ ] Which router, actual v4 pools and solver/RFQ venues are viable on Robinhood Chain today?
- [ ] Is there a private relay available on this chain and what exact guarantees does it provide?
- [ ] Can burner signing be implemented without exposing recoverable private keys to app servers?
- [ ] Which simulation provider supports chain state, contracts and tokenized stock edge cases?
- [ ] What cloud browser infrastructure can guarantee user/session isolation and hard teardown?
- [ ] How will the 'safe' score avoid overconfident false negatives?
- [ ] Which social login / wallet-as-a-service model is acceptable?
- [ ] What exact UI visual references can be legally and technically used?
- [ ] Is name VETTO free to use in brand, domain, handles, app and trademarks?

---

## 20. Developer instructions — handoff priorities

**Build it in this order:**

```text
1. Next.js app shell + original branding
2. Account / wallet connection
3. Typed intent parser and visible intent preview
4. Real swap quote + simulator + wallet-signed execution + receipt
5. Safety report MVP
6. More venue adapters with only real quotes
7. Isolated browser safety scan
8. Burner agent tasks
9. Live remote browser + takeover
10. Verified private relay route (only if available)
11. Optional token features / future markets
```

**Hard requirements:**
- Never ship a mock quote as though it is live.
- Never say a website is guaranteed safe.
- Never ask for the main wallet's seed or private key.
- Never label a public tx as anonymous.
- Never execute a money-moving action from text alone.
- Every external capability has an explicit `verified / planned / unavailable` flag.
- Give engineering owners a test plan, demo proof and tx receipts before considering a phase complete.

**One-line thesis:** *A DeFi assistant that helps users choose, check, and execute — without surrendering wallet control.*

---

## 21. In-app `/docs` page content

**Note:** This is the copy/content for VETTO's in-app Docs page (route `/docs`, per the header in §4: "VETTO | Robinhood Chain | Wallet / Account | Docs"). Written so a developer can drop it straight into a Next.js component in `apps/web` during scaffolding — this is product-facing content, not an internal dev document.

### What is VETTO?

VETTO is a **natural-language DeFi execution assistant** for Robinhood Chain. Type what you want to do — swap assets, check a dApp's safety before you visit it, mint/claim through a deliberately low-balance burner wallet, or open an isolated browser session — and VETTO works out the steps.

**One non-negotiable principle:** VETTO **never executes anything that moves your funds without your explicit approval**. Every transaction is signed by you, through your own wallet.

VETTO is **not**:
- An autonomous trader with unlimited access to your wallet
- A ZK dark pool
- An absolute guarantee of safety
- Something that asks for your main wallet's seed phrase or private key

### How it works — the basic flow

```
SIGN IN
  → ASK IN NATURAL LANGUAGE
  → VETTO TRANSLATES IT into a clear instruction (with a preview you can check)
  → VETTO FINDS REAL OPTIONS (never invented numbers)
  → SIMULATION + SAFETY CHECKS
  → YOU REVIEW
  → YOU EXPLICITLY APPROVE
  → EXECUTION through your own wallet
  → RECEIPT + HISTORY
```

Every step has a pause where you can double-check — nothing "just runs" in the background.

### Feature: Swap

**How to use it:** just type it, e.g. *"swap 10 USDG to ETH"*.

1. VETTO shows an **interpretation preview** — asset, chain, amount, action it understood — before fetching any quote.
2. If anything is ambiguous (e.g. destination token unclear), VETTO **asks for clarification**, never guesses a token contract on its own.
3. VETTO shows **routes that are actually executable** (1 to 5 routes depending on what's available) — not an invented "best price" list. If only one real route exists, only one is shown.
4. Each quote card shows: amount in/out, minimum received, fees, price impact, venue, allowance, estimated gas, and when the quote expires.
5. You review the full detail (asset deltas, destination, approval scope) before signing.
6. Once you approve in your wallet, the transaction is actually submitted on-chain — you get a receipt and an explorer link.

**Slippage:** adjustable (defaults follow the 0.5% standard, can be changed).

### Feature: Private Mode (Private Submission)

**What's actually guaranteed:** if a private relay that's genuinely supported on Robinhood Chain exists, your transaction skips the public mempool before confirmation — that's it.

**What's NOT guaranteed:**
- This is **not** ZK privacy. Once confirmed, your wallet, amount, tokens, and recipient remain **public** on the explorer like any normal transaction.
- Relay operators can still see your pending flow before inclusion.
- There is no blanket MEV immunity.

The "Private" toggle is only enabled when a verified relay provider actually exists for this chain. If none exists, the toggle is disabled and you'll see: *"Private submission is available when the connected relay supports this network. Your transaction becomes public after confirmation."*

### Feature: dApp Safety Checker

**How to use it:** type or paste the URL of a dApp you want checked before visiting it for real.

VETTO runs the check on an **isolated, single-use machine/wallet** (not your own environment):
1. Passive checks first — TLS, domain registration signals, known impersonation patterns, verified contract metadata.
2. If active scanning is enabled: VETTO visits the dApp using a test wallet with **no valuable assets**, attempts representative actions (connect/mint/claim), and captures every approval, signature, and network request.
3. Simulates the attempted transactions — logs every balance/approval delta, including any unlimited-approval requests.
4. The result is a **risk score**: `low concern`, `caution`, `dangerous`, or `insufficient evidence` — never a "100% safe" certification.
5. The entire environment (browser, test wallet, machine) is **destroyed** afterward; VETTO retains only minimal audit metadata.

**Important:** this score is **heuristic**, not an absolute safety guarantee. VETTO will never claim a site is "definitely safe."

### Feature: Agent Tasks (Mint/Claim via Burner Wallet)

**How to use it:** ask VETTO to mint or claim something from a dApp.

- VETTO **never asks for your main wallet's seed phrase or private key**.
- You create/fund a **separate burner wallet** specifically for this task, with a deliberately capped balance.
- Before execution: you're shown a simulation, exact fees, the target contract, the expected output, and the approval scope.
- Every fund-moving task **requires your explicit approval**, no exceptions.
- VETTO rejects unlimited-approval requests by default.
- If a task fails or times out, VETTO says so plainly — it never claims success for something that failed or was only simulated.

### Feature: Live Browser (Remote Browser Session)

**How to use it:** ask VETTO to open an isolated browser session for a site.

- One session = one isolated, single-use machine/container, not your own browser.
- You can **watch the session stream read-only**, then **take control** at any point if you want to try something manually.
- Sessions automatically end and **all data is wiped** afterward — no browser credentials are retained.
- Every session has rate limits and a time-to-live (TTL).

### Sign-in & Wallets

VETTO supports (depending on configuration): external wallets (WalletConnect, Rabby, etc.), or signing in via email/Google/X which comes with an associated wallet.

**What you should know:**
- **Signing in ≠ permission to trade.** Logging in alone does not give VETTO authority to move your funds.
- **A session cookie ≠ signing capability.** Execution always requires your confirmation.
- If you use a custodial/embedded wallet (from a social login provider), it will be clearly labeled as custodial — never disguised as non-custodial.

### Feature status: what's real vs. what's planned

VETTO is upfront about the status of every capability — each external capability (swap routes, private relay, solver, etc.) carries a label:

| Label | Meaning |
|---|---|
| **Verified** | Actually integrated and tested, usable right now |
| **Planned** | Planned, not yet available |
| **Unavailable** | Not supported on this chain/condition right now |

If a feature (e.g. split-routing, private relay, market-maker RFQ) has no real integration or counterparty yet, VETTO shows that status plainly — **it never displays a fake quote/route as if it were real.**

### FAQ

**Can VETTO move my funds without my approval?**
No. Every fund-moving action — swap, mint, claim — requires your explicit confirmation through your own wallet.

**Does "Private" mode make my transaction untraceable?**
No. Private mode only delays when your transaction enters the public mempool. Once confirmed, everything is visible on the explorer like any normal transaction.

**Does the dApp safety score guarantee a site is safe?**
No. The score is heuristic, based on the checks we ran — something could still be missed. Always stay cautious.

**Why does VETTO ask me to create a separate burner wallet for agent tasks?**
So that if something goes wrong (a malicious dApp, a bug, etc.), your maximum loss is capped to the small amount you funded into that burner — not your main wallet.

**Can I take control during a Live Browser session at any time?**
Yes, you can take control at any point while the session is active, and the session ends automatically with all data wiped.

---

## Sources (documentation reviewed on 28 Oct 2026)

- https://sottofi.com/docs
- https://sottofi.com/docs/quickstart
- https://sottofi.com/docs/reading-you
- https://sottofi.com/docs/swaps
- https://sottofi.com/docs/private-mode
- https://sottofi.com/docs/safety-checks
- https://sottofi.com/docs/agent-tasks
- https://sottofi.com/docs/live-browser
- https://sottofi.com/docs/burner-wallets
- https://sottofi.com/docs/intent-format
- https://sottofi.com/docs/assets
- https://sottofi.com/docs/tokenomics
- https://sottofi.com/docs/faq
