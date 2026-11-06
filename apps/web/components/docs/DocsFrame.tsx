import Link from "next/link";
import { Logo } from "@/components/Logo";
import { DocsSidebar } from "./DocsSidebar";

export type DocsTocItem = { id: string; label: string };

export function DocsFrame({
  children,
  activeId,
  toc,
  tocNote,
}: {
  children: React.ReactNode;
  activeId?: string;
  toc: DocsTocItem[];
  tocNote?: string;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-ink/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6" aria-label="Docs header">
          <Link href="/" aria-label="Vetto home" className="shrink-0">
            <Logo />
          </Link>
          <div className="hidden items-center gap-5 text-sm md:flex">
            <Link href="/#introduction" className="text-white/50 transition-colors hover:text-white">Introduction</Link>
            <Link href="/#security" className="text-white/50 transition-colors hover:text-white">Security</Link>
            <Link href="/#status" className="text-white/50 transition-colors hover:text-white">What&apos;s live</Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-xl bg-lilac/[.12] px-3 py-2 font-medium text-white">Docs</span>
            <Link href="/app" className="rounded-xl bg-white px-4 py-2 font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-[.98]">
              Launch app
            </Link>
          </div>
        </nav>
      </header>

      <div className="docs-shell">
        <DocsSidebar activeId={activeId} />
        <main className="docs-main">
          <article className="docs-article">{children}</article>
        </main>
        <aside className="docs-toc" aria-label="On this page">
          {toc.length > 0 && (
            <>
              <span className="docs-toc-label">On this page</span>
              <nav>
                {toc.map((item) => (
                  <a key={item.id} href={`#${item.id}`}>{item.label}</a>
                ))}
              </nav>
            </>
          )}
          {tocNote && <p className="docs-toc-note">{tocNote}</p>}
        </aside>
      </div>
    </div>
  );
}
