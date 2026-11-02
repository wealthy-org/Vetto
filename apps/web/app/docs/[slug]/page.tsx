import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { DOCS } from "@/lib/docs-content";

type Props = { params: Promise<{ slug: string }> };

function docFor(slug: string) {
  return DOCS.find((doc) => doc.id === slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = docFor(slug);
  return doc ? { title: `${doc.title} · Docs · VETTO`, description: doc.summary } : { title: "Docs · VETTO" };
}

export default async function DocsArticlePage({ params }: Props) {
  const { slug } = await params;
  const index = DOCS.findIndex((doc) => doc.id === slug);
  const doc = DOCS[index];
  if (!doc) notFound();

  const toc = [
    { id: "overview", label: "Overview" },
    ...(doc.bullets?.length ? [{ id: "key-points", label: "Key points" }] : []),
  ];
  const previous = DOCS[index - 1];
  const next = DOCS[index + 1];

  return (
    <DocsFrame activeId={doc.id} toc={toc}>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-white/45">
        <Link href="/docs" className="transition-colors hover:text-white">Docs</Link>
        <span aria-hidden="true">/</span>
        <span>{doc.group}</span>
      </div>
      <div className="border-b border-white/10 pb-7">
        <div className="mb-4 inline-flex rounded-xl border border-lilac/20 bg-lilac/[.08] px-3 py-2 text-xs font-medium text-lilac">{doc.group}</div>
        <h1 className="h-display text-4xl sm:text-5xl">{doc.title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/60 sm:text-lg">{doc.summary}</p>
      </div>

      <section id="overview" className="scroll-mt-24 pt-7">
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        {doc.paragraphs.map((paragraph) => (
          <p key={paragraph} className="mt-4 leading-7 text-white/65">{paragraph}</p>
        ))}
      </section>

      {doc.bullets && (
        <section id="key-points" className="mt-9 scroll-mt-24 rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight">Key points</h2>
          <ul className="mt-4 space-y-3">
            {doc.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 leading-relaxed text-white/65">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lilac" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Article navigation" className="mt-12 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
        {previous ? (
          <Link href={`/docs/${previous.id}`} className="rounded-xl border border-white/10 p-4 transition-colors hover:border-lilac/30 hover:bg-white/[.04]">
            <span className="block text-xs text-white/40">Previous</span>
            <span className="mt-1 block font-medium">← {previous.title}</span>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`/docs/${next.id}`} className="rounded-xl border border-white/10 p-4 text-left transition-colors hover:border-lilac/30 hover:bg-white/[.04] sm:text-right">
            <span className="block text-xs text-white/40">Next</span>
            <span className="mt-1 block font-medium">{next.title} →</span>
          </Link>
        )}
      </nav>
    </DocsFrame>
  );
}
