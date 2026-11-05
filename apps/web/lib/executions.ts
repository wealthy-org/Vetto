import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * Execution records: what the user reviewed, what was signed, and what the chain
 * finally said. Status is only ever advanced by a chain receipt, never by a
 * client claim (brief §15, §16.17).
 *
 *   prepared → submitted → confirmed | reverted
 *   prepared → expired   (payload deadline passed without a hash)
 */

export type ExecutionStatus = "prepared" | "submitted" | "confirmed" | "reverted" | "expired";

export interface ExecutionRecord {
  id: string;
  userId: string;
  chainId: number;
  status: ExecutionStatus;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  venueId: string;
  slippageBps: number;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  quoteFingerprint: string;
  payloadHash: string;
  payload: {
    to: string;
    data: string;
    value: string;
    deadline: string;
  };
  txHash: string | null;
  blockNumber: string | null;
  gasUsed: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

interface ExecutionRow {
  id: string;
  user_id: string;
  chain_id: string | number;
  status: ExecutionStatus;
  token_in: string;
  token_out: string;
  amount_in_base_units: string;
  venue_id: string;
  slippage_bps: string | number;
  expected_out_base_units: string;
  min_out_base_units: string;
  quote_fingerprint: string;
  payload_hash: string;
  payload: ExecutionRecord["payload"];
  tx_hash: string | null;
  block_number: string | null;
  gas_used: string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  confirmed_at: Date | string | null;
}

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

function toRecord(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    chainId: Number(row.chain_id),
    status: row.status,
    tokenIn: row.token_in,
    tokenOut: row.token_out,
    amountInBaseUnits: row.amount_in_base_units,
    venueId: row.venue_id,
    slippageBps: Number(row.slippage_bps),
    expectedOutBaseUnits: row.expected_out_base_units,
    minOutBaseUnits: row.min_out_base_units,
    quoteFingerprint: row.quote_fingerprint,
    payloadHash: row.payload_hash,
    payload: row.payload,
    txHash: row.tx_hash,
    blockNumber: row.block_number,
    gasUsed: row.gas_used,
    error: row.error,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    confirmedAt: iso(row.confirmed_at),
  };
}

export interface NewExecution {
  userId: string;
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountInBaseUnits: string;
  venueId: string;
  slippageBps: number;
  expectedOutBaseUnits: string;
  minOutBaseUnits: string;
  quoteFingerprint: string;
  payloadHash: string;
  payload: ExecutionRecord["payload"];
}

export async function createExecution(pool: Pool, input: NewExecution): Promise<ExecutionRecord> {
  const result = await pool.query<ExecutionRow>(
    `insert into swap_executions (
       id, user_id, chain_id, status, token_in, token_out, amount_in_base_units,
       venue_id, slippage_bps, expected_out_base_units, min_out_base_units,
       quote_fingerprint, payload_hash, payload
     ) values ($1,$2,$3,'prepared',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     returning *`,
    [
      randomUUID(),
      input.userId,
      input.chainId,
      input.tokenIn,
      input.tokenOut,
      input.amountInBaseUnits,
      input.venueId,
      input.slippageBps,
      input.expectedOutBaseUnits,
      input.minOutBaseUnits,
      input.quoteFingerprint,
      input.payloadHash,
      JSON.stringify(input.payload),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Execution record was not created.");
  return toRecord(row);
}

export async function getExecution(pool: Pool, userId: string, id: string): Promise<ExecutionRecord | null> {
  const result = await pool.query<ExecutionRow>(
    `select * from swap_executions where id = $1 and user_id = $2`,
    [id, userId],
  );
  return result.rows[0] ? toRecord(result.rows[0]) : null;
}

export async function listExecutions(pool: Pool, userId: string, limit = 20): Promise<ExecutionRecord[]> {
  const result = await pool.query<ExecutionRow>(
    `select * from swap_executions
     where user_id = $1
     order by created_at desc
     limit $2`,
    [userId, Math.max(1, Math.min(limit, 50))],
  );
  return result.rows.map(toRecord);
}

/**
 * Attach a wallet transaction hash. The payload hash must match the record that
 * the server built, so a swapped `to`/`data`/`value` can never be registered.
 */
export async function attachTransactionHash(
  pool: Pool,
  userId: string,
  id: string,
  txHash: string,
  payloadHash: string,
): Promise<{ record: ExecutionRecord } | { error: string }> {
  const result = await pool.query<ExecutionRow>(
    `update swap_executions
     set tx_hash = $3, status = 'submitted', updated_at = now()
     where id = $1 and user_id = $2 and payload_hash = $4 and status = 'prepared'
     returning *`,
    [id, userId, txHash, payloadHash],
  );

  const row = result.rows[0];
  if (row) return { record: toRecord(row) };

  const existing = await getExecution(pool, userId, id);
  if (!existing) return { error: "Execution not found." };
  if (existing.payloadHash !== payloadHash) return { error: "Payload does not match the reviewed transaction." };
  if (existing.status !== "prepared") return { record: existing };
  return { error: "Execution could not be updated." };
}

export interface ReceiptOutcome {
  status: "confirmed" | "reverted" | "submitted";
  blockNumber?: string;
  gasUsed?: string;
}

/**
 * Pure status transition used by the reconciler: a receipt is the only thing
 * allowed to move a record to confirmed/reverted.
 */
export function nextStatus(
  current: ExecutionStatus,
  receipt: { status: "success" | "reverted" } | null,
): ExecutionStatus {
  if (!receipt) return current === "prepared" ? "submitted" : current;
  return receipt.status === "success" ? "confirmed" : "reverted";
}

export async function applyReceipt(
  pool: Pool,
  id: string,
  receipt: { status: "success" | "reverted"; blockNumber: string; gasUsed: string } | null,
): Promise<ExecutionRecord | null> {
  if (!receipt) {
    await pool.query(
      `update swap_executions set status = 'submitted', updated_at = now()
       where id = $1 and status = 'prepared'`,
      [id],
    );
    const current = await pool.query<ExecutionRow>(`select * from swap_executions where id = $1`, [id]);
    return current.rows[0] ? toRecord(current.rows[0]) : null;
  }

  const status = receipt.status === "success" ? "confirmed" : "reverted";
  const result = await pool.query<ExecutionRow>(
    `update swap_executions
     set status = $2,
         block_number = $3,
         gas_used = $4,
         confirmed_at = now(),
         updated_at = now()
     where id = $1 and status in ('prepared', 'submitted')
     returning *`,
    [id, status, receipt.blockNumber, receipt.gasUsed],
  );

  if (result.rows[0]) return toRecord(result.rows[0]);

  const current = await pool.query<ExecutionRow>(`select * from swap_executions where id = $1`, [id]);
  return current.rows[0] ? toRecord(current.rows[0]) : null;
}
