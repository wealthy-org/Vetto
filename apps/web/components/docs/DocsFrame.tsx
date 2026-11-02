import Link from "next/link";
import { Logo } from "@/components/Logo";
import { DocsSidebar } from "./DocsSidebar";

export type DocsTocItem = { id: string; label: string };

export function DocsFrame({
  children,
  activeId,
  toc,
}: {
  children: React.ReactNode;
  activeId?: string;
  toc: DocsTocItem[];
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[.07] bg-ink/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6" aria-label="Docs header">
          <Link href="/" aria-label="Vetto home"><Logo /></Link>
          <div className="hidden items-center gap-5 text-sm md:flex">
            <Link href="/#introduction" className="text-white/50 transition-colors hover:text-white">Introduction</Link>
            <Link href="/#security" className="text-white/50 transition-colors hover:text-white">Security</Link>
            <Link href="/#status" className="text-white/50 transition-colors hover:text-white">What's live</Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-white/[.08] px-3 py-2 font-medium text-white">Docs</span>
            <Link href="/app" className="rounded-full bg-white px-4 py-2 font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-[.98]">Launch app</Link>
          </div>
        </nav>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 pb-20 pt-6 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)_160px] xl:grid-cols-[240px_minmax(0,760px)_190px] xl:gap-8">
        <DocsSidebar activeId={activeId} />
        <main className="min-w-0 rounded-2xl border border-white/[.08] bg-white/[.018] px-5 py-7 sm:px-8 sm:py-9 lg:mt-0">
          {children}
        </main>
        <aside aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 text-xs font-medium text-white/45">On this page</p>
            <nav>
              <ul className="space-y-1">
                {toc.map((item, index) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/[.06] hover:text-white ${index === 0 ? "bg-white/[.06] text-white" : "text-white/55"}`}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
