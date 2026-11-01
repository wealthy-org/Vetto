import Link from "next/link";
import { Logo } from "@/components/Logo";
import { DOCS } from "@/lib/docs-content";

export const metadata = { title: "Docs · VETTO" };

export default function DocsPage() {
  const groups = [...new Set(DOCS.map((d) => d.group))];
  return (
    <div className="relative min-h-screen">
      <div className="text-field pointer-events-none absolute inset-0 -z-10" />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 text-sm">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-5"><Link href="/" className="text-white/70 hover:text-white">Back to site</Link><Link href="/app" className="rounded-full bg-white px-4 py-2 font-semibold text-ink">Open the app</Link></div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 pt-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Docs" className="lg:sticky lg:top-6 lg:self-start">
          {groups.map((g) => (
            <div key={g} className="mb-5">
              <div className="mb-2 text-xs text-white/40">{g}</div>
              <ul className="space-y-1">{DOCS.filter((d) => d.group === g).map((d) => (<li key={d.id}><a href={`#${d.id}`} className="block rounded-lg px-2 py-1.5 text-sm text-white/70 hover:bg-white/[.06] hover:text-white">{d.title}</a></li>))}</ul>
            </div>
          ))}
        </nav>
        <article className="max-w-2xl">
          <h1 className="h-display text-5xl md:text-6xl">Everything Vetto does, <span className="grad">in plain words.</span></h1>
          <div className="mt-12 space-y-14">
            {DOCS.map((d) => (
              <section key={d.id} id={d.id} className="scroll-mt-8">
                <h2 className="text-2xl font-semibold tracking-tight">{d.title}</h2>
                {d.paragraphs.map((p) => (<p key={p} className="mt-3 leading-relaxed text-white/65">{p}</p>))}
                {d.bullets && <ul className="mt-4 list-disc space-y-1.5 pl-5 text-white/65 marker:text-lilac">{d.bullets.map((b) => (<li key={b}>{b}</li>))}</ul>}
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
