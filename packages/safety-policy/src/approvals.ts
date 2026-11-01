export type ApprovalKind = "erc20-approve" | "permit" | "set-approval-for-all";
export type Decision = "allow" | "review" | "block";

export interface ApprovalRequest {
  kind: ApprovalKind;
  /** Amount in base units the spender would be allowed to pull. Ignored for set-approval-for-all. */
  amount: bigint;
  /** Exact amount the reviewed route needs. */
  needed: bigint;
  spenderVerified: boolean;
  /** Only an explicit, logged policy exception may lift a block. */
  exceptionId?: string;
}

export interface ApprovalVerdict { decision: Decision; reasons: string[] }

const UNLIMITED_THRESHOLD = 2n ** 255n;

export function evaluateApproval(r: ApprovalRequest): ApprovalVerdict {
  const reasons: string[] = [];
  const state = { decision: "allow" as Decision };
  const raise = (d: Decision, why: string) => {
    reasons.push(why);
    if (d === "block" || state.decision === "allow") state.decision = d; // block > review > allow
  };

  if (r.kind === "set-approval-for-all") raise("block", "Grants access to every token in the collection.");
  else if (r.amount >= UNLIMITED_THRESHOLD) raise("block", "Unlimited approval requested.");
  else if (r.amount > r.needed) raise("block", "Approval exceeds the amount the reviewed route needs.");

  if (!r.spenderVerified) raise("review", "Spender contract is not verified.");

  if (state.decision === "block" && r.exceptionId) {
    return { decision: "review", reasons: [...reasons, `Policy exception ${r.exceptionId} applied; manual review required.`] };
  }
  return { decision: state.decision, reasons };
}
