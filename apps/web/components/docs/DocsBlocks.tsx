import Link from "next/link";
import { CAPABILITIES } from "@vetto/quote-engine";
import type { DocBlock } from "@/lib/docs-content";
import { DocIcon } from "./doc-icons";

/** Inline markup: **bold**, `code`, *italic*. Deliberately tiny — docs copy stays plain text. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
        if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function DocBody({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="doc-body">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.k) {
    case "h2":
      return (
        <h2 id={block.id}>
          {block.text}
          <a className="anchor" href={`#${block.id}`} aria-label={`Link to ${block.text}`}>
            #
          </a>
        </h2>
      );

    case "h3":
      return <h3>{block.text}</h3>;

    case "p":
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );

    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <Inline text={item} />
            </li>
          ))}
        </ul>
      );

    case "hint": {
      const Icon = block.tone === "warn" || block.tone === "danger" ? DocIcon.warn : block.tone === "tip" ? DocIcon.shield : DocIcon.info;
      return (
        <div className={`hint ${block.tone}`}>
          <Icon />
          <div>
            <p>
              <Inline text={block.text} />
            </p>
          </div>
        </div>
      );
    }

    case "cards":
      return (
        <div className="cards">
          {block.items.map((card) => {
            const Icon = DocIcon[card.icon];
            return (
              <Link key={card.title} href={card.href} className="dcard">
                <span className="ic">
                  <Icon />
                </span>
                <span className="t">
                  {card.title}
                  {card.badge && <span className="badge">{card.badge}</span>}
                </span>
                <span>{card.body}</span>
              </Link>
            );
          })}
        </div>
      );

    case "steps":
      return (
        <ol className="steps">
          {block.items.map((step) => (
            <li key={step.title}>
              <b>{step.title}</b>
              <p>
                <Inline text={step.body} />
              </p>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div className="table-wrap">
          <table className="dt">
            <thead>
              <tr>
                {block.head.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "prompt":
      return (
        <div className="prompt">
          <span>{block.text}</span>
          <Link className="try" href={`/app?ask=${encodeURIComponent(block.text)}`}>
            Try
          </Link>
        </div>
      );

    case "facts":
      return (
        <div className="facts">
          {block.items.map((fact) => (
            <div key={fact.label}>
              <b>{fact.big}</b>
              <span>{fact.label}</span>
              {fact.note && <small>{fact.note}</small>}
            </div>
          ))}
        </div>
      );

    case "capabilities":
      return (
        <div className="table-wrap">
          <table className="dt">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((capability) => (
                <tr key={capability.id}>
                  <td>{capability.label}</td>
                  <td>
                    <span className={`status status-${capability.status}`}>
                      {capability.status === "verified" ? "Verified" : capability.status === "planned" ? "Planned" : "Unavailable"}
                    </span>
                  </td>
                  <td>{capability.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "faq":
      return (
        <>
          {block.items.map((item) => (
            <details key={item.q} className="faq">
              <summary>{item.q}</summary>
              <p>
                <Inline text={item.a} />
              </p>
            </details>
          ))}
        </>
      );

    default:
      return null;
  }
}
