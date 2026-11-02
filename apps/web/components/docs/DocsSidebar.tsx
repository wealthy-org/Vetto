"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DOCS } from "@/lib/docs-content";

const GROUPS = [...new Set(DOCS.map((doc) => doc.group))];

export function DocsSidebar({ activeId }: { activeId?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? DOCS.filter((doc) => `${doc.title} ${doc.group} ${doc.summary}`.toLowerCase().includes(needle)) : DOCS;
  }, [query]);

  const contents = (
    <>
      <label className="relative block">
        <span className="sr-only">Search docs</span>
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the docs"
          className="w-full rounded-xl border border-white/10 bg-black/10 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-white/35 focus:border-lilac/50 focus:outline-none"
        />
      </label>
      <nav aria-label="Documentation chapters" className="mt-5 space-y-5">
        {GROUPS.map((group) => {
          const docs = filtered.filter((doc) => doc.group === group);
          if (!docs.length) return null;
          return (
            <div key={group}>
              <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35">{group}</h2>
              <ul className="space-y-1">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/docs/${doc.id}`}
                      aria-current={activeId === doc.id ? "page" : undefined}
                      className={`block rounded-xl px-3 py-2.5 text-sm transition-colors ${activeId === doc.id ? "border border-lilac/20 bg-lilac/[.1] font-medium text-white" : "text-white/60 hover:bg-white/[.05] hover:text-white"}`}
                    >
                      {doc.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!filtered.length && <p className="px-2 text-sm text-white/45">No topics match your search.</p>}
      </nav>
    </>
  );

  return (
    <>
      <div className="lg:hidden">
        <details className="group rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
            Browse docs <span aria-hidden="true" className="float-right text-white/45 group-open:rotate-180">⌄</span>
          </summary>
          <div className="mt-4 border-t border-white/10 pt-4">{contents}</div>
        </details>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-white/[.08] bg-white/[.02] p-3">{contents}</div>
      </aside>
    </>
  );
}
