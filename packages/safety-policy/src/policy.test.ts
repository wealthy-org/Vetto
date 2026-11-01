import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPublicUrl, checkResolvedIps, evaluateApproval, buildReport, bandFromScore, isPublicIp } from "./index.ts";

test("SSRF: private, loopback, metadata and encoded IPs are rejected", () => {
  const bad = [
    "https://localhost/", "https://127.0.0.1/", "https://2130706433/", "https://0x7f.1/", "https://127.1/",
    "https://169.254.169.254/latest/meta-data", "https://10.0.0.5/", "https://192.168.1.1/", "https://172.16.0.1/",
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fe80::1]/", "https://[fd00::1]/",
    "https://metadata.google.internal/", "https://printer.local/", "https://intranet/", "http://example.com/",
    "https://user:pw@example.com/", "https://example.com:8443/", "ftp://example.com/", "not a url",
  ];
  for (const u of bad) assert.equal(checkPublicUrl(u).ok, false, u);
});

test("SSRF: ordinary public https hosts pass and fragments are dropped", () => {
  const r = checkPublicUrl("https://Example-Dex.app/swap?a=1#frag");
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.host, "example-dex.app"); assert.equal(r.url.hash, ""); }
  assert.ok(checkPublicUrl("https://[2606:4700:4700::1111]/").ok);
  assert.ok(isPublicIp("8.8.8.8"));
});

test("DNS rebinding: one private answer rejects the whole set", () => {
  assert.equal(checkResolvedIps(["93.184.216.34"]).ok, true);
  assert.equal(checkResolvedIps(["93.184.216.34", "10.0.0.1"]).ok, false);
  assert.equal(checkResolvedIps([]).ok, false);
});

test("approvals: unlimited and oversized approvals are blocked, exceptions only downgrade to review", () => {
  const base = { kind: "erc20-approve" as const, needed: 10_000_000n, spenderVerified: true };
  assert.equal(evaluateApproval({ ...base, amount: 10_000_000n }).decision, "allow");
  assert.equal(evaluateApproval({ ...base, amount: 2n ** 256n - 1n }).decision, "block");
  assert.equal(evaluateApproval({ ...base, amount: 10_000_001n }).decision, "block");
  assert.equal(evaluateApproval({ ...base, amount: 10_000_000n, spenderVerified: false }).decision, "review");
  assert.equal(evaluateApproval({ kind: "set-approval-for-all", amount: 0n, needed: 0n, spenderVerified: true }).decision, "block");
  assert.equal(evaluateApproval({ ...base, amount: 2n ** 256n - 1n, exceptionId: "EX-1" }).decision, "review");
});

test("risk bands follow the documented thresholds", () => {
  assert.equal(bandFromScore(80), "low concern");
  assert.equal(bandFromScore(79), "caution");
  assert.equal(bandFromScore(50), "caution");
  assert.equal(bandFromScore(49), "dangerous");
  assert.equal(bandFromScore(null), "insufficient evidence");
});

test("passive-only reports can never read as low concern", () => {
  const r = buildReport({ findings: [], checksRun: ["https", "public host"], checksUnavailable: ["sandbox run"] });
  assert.equal(r.band, "insufficient evidence");
  const many = buildReport({ findings: [], checksRun: ["a", "b", "c", "d"], checksUnavailable: ["sandbox run"] });
  assert.equal(many.band, "caution");
  const bad = buildReport({ findings: [{ id: "x", severity: "critical", title: "t", evidence: "e" }], checksRun: ["a"], checksUnavailable: [] });
  assert.equal(bad.band, "dangerous");
});
