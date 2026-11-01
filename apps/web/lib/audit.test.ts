import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeMeta, writeAudit } from "./audit.ts";

test("sanitizeMeta drops secret-looking keys and truncates long strings", () => {
  const out = sanitizeMeta({ host: "demo-dex.app", apiKey: "sk-1", Seed_Phrase: "x", authToken: "t", note: "a".repeat(500) });
  assert.deepEqual(Object.keys(out).sort(), ["host", "note"]);
  assert.equal((out.note as string).length, 200);
});

test("writeAudit issues a parameterised insert (no string interpolation)", async () => {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  await writeAudit({ query: async (text, values) => { calls.push({ text, values }); } }, {
    userId: "00000000-0000-4000-8000-000000000001",
    action: "inspect.passive", intentKind: "inspect", decision: "insufficient evidence", meta: { host: "demo-dex.app", secret: "no" },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /insert into audit_log .* values \(\$1, \$2, \$3, \$4, \$5::jsonb\)/);
  assert.deepEqual(calls[0]!.values, ["00000000-0000-4000-8000-000000000001", "inspect.passive", "inspect", "insufficient evidence", '{"host":"demo-dex.app"}']);
});