import Link from "next/link";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { DOCS } from "@/lib/docs-content";

export const metadata = { title: "Docs · VETTO" };

const GROUPS = [...new Set(DOCS.map((doc) => doc.group))];
const TOC = [
  { id: "what-youll-find", label: "What you'll find" },
  { id: "start-here", label: "Start here" },
  { id: "browse-by-topic", label: "Browse by topic" },
];

export default function DocsPage() {
  return (
    <DocsFrame toc={TOC}>
      <div className="mb-4 text-xs font-medium text-lilac">Vetto docs</div>
      <h1 className="h-display max-w-3xl text-4xl sm:text-5xl md:text-6xl">
        Everything Vetto does, <span className="grad">in plain words.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
        Learn how Vetto works, what is available today, and where the safety boundaries are.
        Each topic has its own page so you can jump straight to what you need.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/app" className="btn btn-primary">Open the app <span aria-hidden="true">→</span></Link>
        <Link href={`/docs/${DOCS[0]!.id}`} className="btn btn-ghost">Start with the basics</Link>
      </div>

      <section id="what-youll-find" className="mt-10 scroll-mt-24 rounded-2xl border border-white/10 bg-white/[.035] p-5 sm:p-6">
        <h2 className="text-lg font-semibold">What you'll find</h2>
        <p className="mt-2 leading-relaxed text-white/65">
          Vetto is a natural-language DeFi assistant for Robinhood Chain. These docs explain
          how to ask for an action, review what Vetto proposes, and understand what it can and
          cannot do. Nothing moves without your explicit approval.
        </p>
      </section>

      <section id="start-here" className="mt-8 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Start here</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/60">New to Vetto? Begin with the overview, then follow a request from prompt to review.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DOCS.slice(0, 2).map((doc, index) => (
            <Link key={doc.id} href={`/docs/${doc.id}`} className="group rounded-2xl border border-white/10 bg-white/[.03] p-5 transition-colors hover:border-lilac/35 hover:bg-white/[.06]">
              <span className="text-xs text-lilac">0{index + 1} · {doc.group}</span>
              <h3 className="mt-2 font-semibold group-hover:text-lilac">{doc.title}<span aria-hidden="true" className="ml-2">→</span></h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{doc.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <section id="browse-by-topic" className="mt-10 scroll-mt-24">
        <h2 className="text-2xl font-semibold tracking-tight">Browse by topic</h2>
        <div className="mt-5 space-y-7">
          {GROUPS.map((group) => (
            <div key={group}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-white/40">{group}</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {DOCS.filter((doc) => doc.group === group).map((doc) => (
                  <li key={doc.id}>
                    <Link href={`/docs/${doc.id}`} className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[.025] p-4 transition-colors hover:border-lilac/30 hover:bg-white/[.05]">
                      <span className="font-medium group-hover:text-lilac">{doc.title}<span aria-hidden="true" className="ml-2">→</span></span>
                      <span className="mt-1.5 text-sm leading-relaxed text-white/50">{doc.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </DocsFrame>
  );
}
