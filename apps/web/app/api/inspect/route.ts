import { auditFor } from "@/lib/audit-request";
import { checkHostDns } from "@/lib/dns-check";
import { buildReport, checkPublicUrl, findBrandLookalikes, type RiskFinding } from "@vetto/safety-policy";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Passive link inspection ONLY: URL policy + a DNS lookup. The site itself is never contacted.
 * Active scans (TLS, domain age, sandboxed browser) are queued to the isolated worker in Phase 3.
 */
export async function POST(req: Request) {
  const g = await guardJson(req, "inspect", 15);
  if ("res" in g) return g.res;
  if (!isRecord(g.body) || typeof g.body.url !== "string") return jsonError(400, "Expected { url: string }.");

  const check = checkPublicUrl(g.body.url);
  const findings: RiskFinding[] = [];
  const run = ["URL scheme and credentials", "Public-host policy", "Brand lookalike heuristic"];
  const unavailable = ["TLS certificate", "Domain registration age", "Official domain ownership", "Contract verification", "Sandboxed wallet run", "Approval and signature capture"];

  if (!check.ok) {
    findings.push({ id: "url-policy", severity: "critical", title: "Link rejected by policy", evidence: check.reason, uncertainty: "The site was never contacted." });
    const report = buildReport({ findings, checksRun: run, checksUnavailable: [] });
    await auditFor(req, { action: "inspect.passive", intentKind: "inspect", decision: "rejected", meta: { reason: check.reason } });
    return jsonOk({ host: null, report });
  }

  if (check.host.startsWith("xn--") || check.host.includes(".xn--")) {
    findings.push({ id: "idn", severity: "medium", title: "Internationalised domain", evidence: `${check.host} uses punycode and can visually imitate another hostname.`, uncertainty: "Punycode alone does not establish impersonation or malicious intent." });
  }
  for (const match of findBrandLookalikes(check.host)) {
    findings.push({
      id: `brand-lookalike-${match.brand}-${match.label}`,
      severity: "medium",
      title: "Possible brand lookalike",
      evidence: `The hostname label "${match.label}" differs by one character from "${match.brand}".`,
      uncertainty: "This spelling similarity is a heuristic only; site ownership and intent were not checked.",
    });
  }

  // DNS-rebinding defence: a public-looking name must not resolve to a private/reserved address.
  const dns = await checkHostDns(check.host);
  if (dns.status === "public") {
    run.push("DNS resolves to public addresses");
  } else if (dns.status === "private") {
    run.push("DNS resolves to public addresses");
    findings.push({ id: "dns-private", severity: "critical", title: "Hostname resolves to a private or reserved address", evidence: dns.reason, uncertainty: "The site itself was never contacted." });
  } else {
    unavailable.unshift("DNS resolution");
    findings.push({ id: "dns-unresolved", severity: "medium", title: "Hostname did not resolve", evidence: "No DNS answer was received within 3 seconds.", uncertainty: "The domain may not exist, or the lookup may have failed temporarily." });
  }

  // Passive checks alone must never produce a verdict: with fewer than 6 completed checks (the active
  // sandbox ones are Phase 3) the band stays "insufficient evidence", unless a critical finding exists.
  const report = buildReport({ findings, checksRun: run, checksUnavailable: unavailable, minChecks: 6 });
  await auditFor(req, { action: "inspect.passive", intentKind: "inspect", decision: report.band, meta: { host: check.host } });
  return jsonOk({ host: check.host, report });
}