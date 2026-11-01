import type { CapabilityStatus } from "@vetto/quote-engine";

const LABEL: Record<CapabilityStatus, string> = { verified: "Verified", planned: "Planned", unavailable: "Unavailable" };

export function StatusChip({ status }: { status: CapabilityStatus }) {
  return <span className={`status status-${status}`}>{LABEL[status]}</span>;
}
