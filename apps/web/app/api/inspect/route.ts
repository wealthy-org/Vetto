import { audit } from "@/lib/audit";
import { buildReport, checkPublicUrl, findBrandLookalikes, type RiskFinding } from "@vetto/safety-policy";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Passive link inspection ONLY: URL policy, no network requests to the target.
 * Active scans (TLS, domain age, sandboxed browser) are queued to the isolated worker in Phase 3.
 */
export async function POST(req: Request) {
    const g = await guardJson(req, "inspect", 15);
  if ("res" in g) return g.res;
  if (!isRecord(g.body) || typeof g.body.url !== "string") return jsonError(400, "Expected { url: string }.");

  const check = checkPublicUrl(g.body.url);
  const findings: RiskFinding[] = [];
  const run = ["URL scheme and credentials", "Public-host policy", "Brand lookalike heuristic"];

  if (!check.ok) {
    findings.push({ id: "url-policy", severity: "critical", title: "Link rejected by policy", evidence: check.reason, uncertainty: "The site was never contacted." });
    const report = buildReport({ findings, checksRun: run, checksUnavailable: [] });
    await audit({ action: "inspect.passive", intentKind: "inspect", decision: "rejected", meta: { reason: check.reason } });
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

   const report = buildReport({
    findings, checksRun: run,
    checksUnavailable: ["TLS certificate", "Domain registration age", "Official domain ownership", "Contract verification", "Sandboxed wallet run", "Approval and signature capture"],
    });
    await audit({ action: "inspect.passive", intentKind: "inspect", decision: report.band, meta: { host: check.host } });
    return jsonOk({ host: check.host, report });
}
