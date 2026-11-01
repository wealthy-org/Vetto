export type RiskBand = "low concern" | "caution" | "dangerous" | "insufficient evidence";
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface RiskFinding {
  id: string;
  severity: Severity;
  title: string;
  evidence: string;
  /** What we could not verify. Required so reports can't read as certifications. */
  uncertainty?: string;
}

export interface RiskReport {
  band: RiskBand;
  score: number | null;
  findings: RiskFinding[];
  checksRun: string[];
  checksUnavailable: string[];
  disclaimer: string;
}

export const DISCLAIMER = "Heuristic result from the checks listed. It is not a guarantee that a site is safe.";

/** 80+ low concern · 50–79 caution · 0–49 dangerous · null => insufficient evidence. */
export function bandFromScore(score: number | null): RiskBand {
  if (score === null || Number.isNaN(score)) return "insufficient evidence";
  if (score >= 80) return "low concern";
  if (score >= 50) return "caution";
  return "dangerous";
}

const PENALTY: Record<Severity, number> = { info: 0, low: 5, medium: 15, high: 30, critical: 60 };

/**
 * Passive-only reports never claim "low concern": with fewer than `minChecks` completed checks
 * the band is capped at "insufficient evidence", no matter how clean the findings look.
 */
export function buildReport(input: { findings: RiskFinding[]; checksRun: string[]; checksUnavailable: string[]; minChecks?: number }): RiskReport {
  const minChecks = input.minChecks ?? 4;
  const hasCritical = input.findings.some((f) => f.severity === "critical");
  let score: number | null = input.checksRun.length >= minChecks || hasCritical
    ? Math.max(0, 100 - input.findings.reduce((n, f) => n + PENALTY[f.severity], 0))
    : null;
  if (score !== null && input.checksUnavailable.length > 0) score = Math.min(score, 79); // never "low concern" with blind spots
  return { band: bandFromScore(score), score, findings: input.findings, checksRun: input.checksRun, checksUnavailable: input.checksUnavailable, disclaimer: DISCLAIMER };
}
