import type { Metadata } from "next";
import Link from "next/link";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { DocBody } from "@/components/docs/DocsBlocks";
import { DocIcon } from "@/components/docs/doc-icons";
import type { DocBlock } from "@/lib/docs-content";

export const metadata: Metadata = {
  title: "Docs · VETTO",
  description: "Everything Vetto does, in plain words: live swaps, approvals, link checks, burner tasks and exactly what is not built yet.",
};

const TOC = [
  { id: "what-vetto-can-do", label: "What Vetto does today" },
  { id: "on-the-roadmap", label: "On the roadmap" },
  { id: "the-short-version", label: "The short version" },
  { id: "ground-rules", label: "Ground rules" },
];

const BLOCKS: DocBlock[] = [
  {
    k: "hint",
    tone: "info",
    text: "**Vetto runs on Robinhood Chain (4663).** Say what you want and Vetto finds the way, quotes the pools that actually answered, and waits for your wallet before anything is signed.",
  },
  { k: "h2", id: "what-vetto-can-do", text: "What Vetto does today" },
  {
    k: "cards",
    items: [
      { icon: "swap", title: "Swaps and routing", href: "/docs/swaps", body: "Live v4 quotes ranked by what you receive. One route is a complete answer." },
      { icon: "search", title: "dApp safety checks", href: "/docs/dapp-checker", body: "Passive URL and DNS checks before you connect anything." },
      { icon: "read", title: "How Vetto reads you", href: "/docs/reading-you", body: "A line above the composer shows the parse before you press Enter." },
      { icon: "status", title: "What's live", href: "/docs/status", body: "Every capability, its label, and what that label lets you rely on." },
    ],
  },
  { k: "h2", id: "on-the-roadmap", text: "On the roadmap" },
  {
    k: "p",
    text: "These pages exist so you can see the plan and the reasoning. None of them runs in this build: the app labels them **Planned** or **Unavailable**, and nothing is simulated to look live. A deployment makes the app reachable — it does not add a relay, a solver, or a burner machine.",
  },
  {
    k: "cards",
    muted: true,
    items: [
      { icon: "key", title: "Permit2 approvals", href: "/docs/permit2-approval", body: "Built server-side and unit-tested; waits on one funded transaction before it can be called verified.", badge: "Roadmap" },
      { icon: "burner", title: "Agent tasks", href: "/docs/agent-tasks", body: "Mint and claim with a capped burner wallet. Parsed today, executed in Phase 3.", badge: "Roadmap" },
      { icon: "browser", title: "Live browser", href: "/docs/live-browser", body: "Watch the session and take the controls. Needs isolated per-session compute.", badge: "Roadmap" },
      { icon: "shield", title: "Private submission", href: "/docs/private-submission", body: "No relay on this chain yet, so the switch stays off and says so.", badge: "Needs a relay" },
    ],
  },
  { k: "h2", id: "the-short-version", text: "The short version" },
  {
    k: "p",
    text: "There are no menus to learn. You type what you want, Vetto works out what you mean, shows the options it can actually fill, and you decide. While you type, a line above the chat box tells you how the sentence was read, so nothing is a surprise when you press Enter.",
  },
  { k: "h2", id: "ground-rules", text: "Ground rules" },
  {
    k: "ul",
    items: [
      "Your keys stay in your wallet. Vetto never asks for a seed phrase and rejects one if it is pasted.",
      "Every swap is re-quoted and simulated before your wallet is asked to sign.",
      "A capability that is not built is labelled **Planned** or **Unavailable** — never simulated to look live.",
      "Nothing executes without your confirmation, and status only becomes confirmed when the chain returns a receipt.",
    ],
  },
];

export default function DocsIndexPage() {
  return (
    <DocsFrame toc={TOC} tocNote="Docs describe the build you are looking at. Capability labels come from the same registry the app uses.">
      <section className="docs-hero">
        <span className="docs-hero-tile">
          <DocIcon.welcome />
        </span>
        <span className="docs-hero-label">Vetto docs</span>
        <h1>
          Everything Vetto does, <span className="grad">in plain words.</span>
        </h1>
        <p>
          Tell Vetto what you want and it finds the way on Robinhood Chain, quotes the pools that answered,
          checks what is risky, and leaves the signature to you.
        </p>
        <div className="docs-hero-ctas">
          <Link href="/app" className="docs-cta-light">
            Open the app
            <i>
              <DocIcon.arrow />
            </i>
          </Link>
          <Link href="/docs/quickstart" className="docs-cta-ghost">Quickstart</Link>
        </div>
      </section>

      <DocBody blocks={BLOCKS} />

      <nav className="docs-pn" aria-label="Previous and next">
        <span />
        <Link href="/docs/quickstart" className="docs-pn-r">
          <small>Next</small>
          <b>Quickstart</b>
        </Link>
      </nav>
    </DocsFrame>
  );
}
