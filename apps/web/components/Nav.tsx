"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const TABS = [
  { id: "introduction", label: "Introduction" },
  { id: "security", label: "Security" },
  { id: "status", label: "What's live" },
] as const;

export function Nav() {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const els = TABS.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((e) => io.observe(e));
    const onTop = () => { if (window.scrollY < 200) setActive(""); };
    window.addEventListener("scroll", onTop, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onTop); };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-ink pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5" aria-label="Main">
        <Link href="/" className="text-[15px]"><Logo /></Link>
        <ul className="glass hidden items-center gap-1 rounded-full p-1 text-[13px] md:flex">
          {TABS.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}
                className={`block rounded-full px-3.5 py-1.5 transition-colors ${active === t.id ? "bg-white/12 text-white" : "text-white/60 hover:text-white"}`}>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 text-[13px]">
          <Link href="/docs" className="text-white/70 transition-colors hover:text-white">Docs</Link>
          <Link href="/app" className="rounded-full bg-white px-4 py-2 font-semibold text-ink transition-transform active:scale-95">Launch app</Link>
        </div>
      </nav>
    </header>
  );
}
