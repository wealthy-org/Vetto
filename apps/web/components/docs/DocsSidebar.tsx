"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DOC_PAGES, docsByGroup } from "@/lib/docs-content";
import { DocIcon, type DocIconName } from "./doc-icons";

type Entry = { id: string; title: string; group: string; lead: string; icon: DocIconName; href: string };

const WELCOME: Entry = {
  id: "welcome",
  title: "Welcome",
  group: "Introduction",
  lead: "What Vetto is, what it can do today, and where it stops.",
  icon: "welcome",
  href: "/docs",
};

const PAGE_ENTRIES: Entry[] = docsByGroup().flatMap(({ pages }) => pages.map((page) => ({
  id: page.id,
  title: page.title,
  group: page.group,
  lead: page.lead,
  icon: page.icon,
  href: `/docs/${page.id}`,
})));

const ALL: Entry[] = [WELCOME, ...PAGE_ENTRIES];

const MENU = [
  { group: "Introduction", pages: [WELCOME, ...PAGE_ENTRIES.filter((entry) => entry.group === "Introduction")] },
  ...docsByGroup()
    .filter(({ group }) => group !== "Introduction")
    .map(({ group, pages }) => ({
      group,
      pages: pages.map((page) => PAGE_ENTRIES.find((entry) => entry.id === page.id)!),
    })),
];

function search(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  return ALL.filter((entry) =>
    `${entry.title} ${entry.group} ${entry.lead}`.toLowerCase().includes(needle),
  );
}

function Contents({ activeId, query, setQuery }: { activeId?: string; query: string; setQuery: (value: string) => void }) {
  const results = useMemo(() => search(query), [query]);

  return (
    <>
      <label className="docs-search">
        <span className="docs-search-ico">
          <DocIcon.search />
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the docs"
          aria-label="Search the docs"
        />
      </label>

      {results ? (
        <div className="docs-results">
          {results.length ? (
            results.map((entry) => (
              <Link key={entry.id} href={entry.href} className="docs-result">
                <b>{entry.title}</b>
                <small>{entry.group} · {entry.lead}</small>
              </Link>
            ))
          ) : (
            <p className="docs-none">No topic matches “{query}”. Try “swap”, “approval” or “burner”.</p>
          )}
        </div>
      ) : (
        <nav className="docs-groups" aria-label="Documentation">
          {MENU.map(({ group, pages }) => (
            <div className="docs-group" key={group}>
              <h4>{group}</h4>
              {pages.map((entry) => {
                const Icon = DocIcon[entry.icon];
                return (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    className="docs-nav-item"
                    aria-current={activeId === entry.id ? "page" : undefined}
                  >
                    <span className="docs-glyph">
                      <Icon />
                    </span>
                    <span>{entry.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      )}
    </>
  );
}

export function DocsSidebar({ activeId }: { activeId?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const current = ALL.find((entry) => entry.id === activeId) ?? WELCOME;
  const CurrentIcon = DocIcon[current.icon];

  return (
    <>
      {/* Below the shell breakpoint the sidebar becomes one dropdown with the current page in it. */}
      <div className="docs-mbar">
        <button type="button" className="docs-mbtn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="docs-glyph">
            <CurrentIcon />
          </span>
          <span className="docs-mtitle">
            <small>{current.group}</small>
            <b>{current.title}</b>
          </span>
          <i data-open={open ? "" : undefined}>
            <DocIcon.chevronDown />
          </i>
        </button>
        {open && (
          <div className="docs-msheet" onClick={() => setOpen(false)}>
            <Contents activeId={activeId} query={query} setQuery={setQuery} />
          </div>
        )}
      </div>

      <aside className="docs-side">
        <Contents activeId={activeId} query={query} setQuery={setQuery} />
      </aside>
    </>
  );
}

export const DOC_ENTRY_COUNT = DOC_PAGES.length;
