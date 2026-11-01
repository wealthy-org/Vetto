import { getPool } from "./db";

export interface AuditEvent {
  /** mis. "intent.parse", "quotes.request", "inspect.passive" */
  action: string;
  intentKind?: string;
  decision?: string;
  /** Metadata kecil & tidak sensitif. Jangan pernah teks mentah pengguna, IP, atau rahasia. */
  meta?: Record<string, unknown>;
}

interface AuditDb {
  query(text: string, values: readonly unknown[]): Promise<unknown>;
}

const SENSITIVE_KEY = /key|secret|seed|mnemonic|private|token|password|cookie|auth/i;

/** Pertahanan berlapis: buang key yang tampak rahasia dan batasi panjang string. */
export function sanitizeMeta(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return out;
}

export async function writeAudit(db: AuditDb, e: AuditEvent): Promise<void> {
  await db.query(
    "insert into audit_log (action, intent_kind, decision, meta) values ($1, $2, $3, $4::jsonb)",
    [e.action, e.intentKind ?? null, e.decision ?? null, JSON.stringify(sanitizeMeta(e.meta))],
  );
}

/**
 * Best-effort untuk endpoint baca/parse: tidak pernah melempar error dan tidak memblokir request.
 * Endpoint yang memindahkan dana (execute/prepare, nanti) HARUS memanggil writeAudit() langsung
 * dan menolak request jika audit gagal (fail closed).
 */
export async function audit(e: AuditEvent): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return; // dev tanpa database
  try {
    const pool = getPool(url);
    await writeAudit({ query: (text, values) => pool.query(text, [...values]) }, e);
  } catch (error) {
    console.error("audit write failed:", error instanceof Error ? error.message : error);
  }
}