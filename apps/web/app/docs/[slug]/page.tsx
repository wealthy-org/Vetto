import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocsFrame } from "@/components/docs/DocsFrame";
import { DocBody } from "@/components/docs/DocsBlocks";
import { DocIcon } from "@/components/docs/doc-icons";
import { DOC_PAGES, DOC_STATUS_LABEL, type DocBlock } from "@/lib/docs-content";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = DOC_PAGES.find((entry) => entry.id === slug);
  return page
    ? { title: `${page.title} · Docs · VETTO`, description: page.lead }
    : { title: "Docs · VETTO" };
}

const headingid = (block: DocBlock) => (block.k === "h2" ? block.id : null);

export default async function DocsArticlePage({ params }: Props) {
  const { slug } = await params;
  const index = DOC_PAGES.findIndex((entry) => entry.id === slug);
  const page = DOC_PAGES[index];
  if (!page) notFound();

  const previous = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];
  const toc = page.blocks
    .filter((block) => headingid(block) !== null)
    .map((block) => ({ id: (block as { id: string }).id, label: (block as { text: string }).text }));
  const Glyph = DocIcon[page.icon];

  return (
    <DocsFrame activeId={page.id} toc={toc} tocNote={page.tocNote}>
      <header className="docs-head">
        <span className="docs-crumb">
          <Link href="/docs">Docs</Link>
          <i>/</i>
          {page.group}
        </span>
        <div className="docs-title-row">
          <span className="docs-page-glyph">
            <Glyph />
          </span>
          <h1>
            {page.title}
            {page.status && (
              <em data-b={DOC_STATUS_LABEL[page.status]}>{DOC_STATUS_LABEL[page.status]}</em>
            )}
          </h1>
        </div>
        <p className="docs-lead">{page.lead}</p>
      </header>

      <DocBody blocks={page.blocks} />

      <nav className="docs-pn" aria-label="Previous and next">
        {previous ? (
          <Link href={`/docs/${previous.id}`} className="docs-pn-l">
            <small>Previous</small>
            <b>{previous.title}</b>
          </Link>
        ) : (
          <Link href="/docs" className="docs-pn-l">
            <small>Previous</small>
            <b>Welcome</b>
          </Link>
        )}
        {next ? (
          <Link href={`/docs/${next.id}`} className="docs-pn-r">
            <small>Next</small>
            <b>{next.title}</b>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </DocsFrame>
  );
}
