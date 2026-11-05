import type { Pool } from "pg";
import { applyReceipt, type ExecutionRecord } from "./executions";
import { ROBINHOOD_CHAIN_ID, rpcClient, rpcUrls } from "./robinhood-chain";

/**
 * Receipt reconciliation.
 *
 * A hash reported by the browser is not proof: before a record can move to
 * `confirmed`, the chain itself must return a receipt for that hash, on chain
 * 4663, for a transaction whose `to`, `input` and `value` match the payload the
 * server built. A mismatch is recorded as `reverted` with an explanation — the
 * app must never claim a swap succeeded when it did not (brief §16.17).
 */

export interface ReconcileOutcome {
  record: ExecutionRecord | null;
  /** True when a fresh receipt was observed on chain during this call. */
  receiptSeen: boolean;
  note?: string;
}

interface RpcReceipt {
  status?: string;
  blockNumber?: string;
  gasUsed?: string;
  to?: string | null;
  from?: string | null;
  transactionHash?: string;
  input?: string;
  value?: string;
}

export async function reconcileExecution(pool: Pool, record: ExecutionRecord): Promise<ReconcileOutcome> {
  if (!record.txHash) return { record, receiptSeen: false };
  if (record.status === "confirmed" || record.status === "reverted") {
    return { record, receiptSeen: false };
  }

  const { primary } = rpcUrls();

  let receipt: RpcReceipt | null;
  try {
    receipt = (await rpcClient(primary, 10_000).request({
      method: "eth_getTransactionReceipt",
      params: [record.txHash as `0x${string}`],
    })) as RpcReceipt | null;
  } catch {
    return { record, receiptSeen: false, note: "RPC unavailable; receipt not checked." };
  }

  if (!receipt) {
    const updated = await applyReceipt(pool, record.id, null);
    return { record: updated, receiptSeen: false, note: "Waiting for the transaction to be mined." };
  }

  // A receipt exists: verify it belongs to the reviewed payload.
  try {
    const tx = (await rpcClient(primary, 10_000).request({
      method: "eth_getTransactionByHash",
      params: [record.txHash as `0x${string}`],
    })) as { to?: string | null; input?: string; value?: string } | null;

    const to = (tx?.to ?? receipt.to ?? "").toLowerCase();
    const input = (tx?.input ?? "").toLowerCase();
    const value = tx?.value ? BigInt(tx.value).toString() : "0";

    const payloadMatches =
      to === record.payload.to.toLowerCase() &&
      input === record.payload.data.toLowerCase() &&
      value === BigInt(record.payload.value).toString();

    if (!payloadMatches) {
      const updated = await applyReceipt(pool, record.id, {
        status: "reverted",
        blockNumber: receipt.blockNumber ?? "0",
        gasUsed: receipt.gasUsed ?? "0",
      });
      return {
        record: updated,
        receiptSeen: true,
        note: "On-chain transaction did not match the reviewed payload.",
      };
    }
  } catch {
    return { record, receiptSeen: false, note: "Could not verify the transaction body yet." };
  }

  const success = receipt.status === "0x1";
  const updated = await applyReceipt(pool, record.id, {
    status: success ? "success" : "reverted",
    blockNumber: receipt.blockNumber ?? "0",
    gasUsed: receipt.gasUsed ?? "0",
  });

  return {
    record: updated,
    receiptSeen: true,
    note: success ? undefined : "The transaction reverted on chain.",
  };
}

export const EXPLORER_TX_URL = `${"https://robinhoodchain.blockscout.com"}/tx/`;

export function explorerLink(txHash: string): string {
  return `${EXPLORER_TX_URL}${txHash}`;
}

export const EXECUTION_CHAIN_ID = ROBINHOOD_CHAIN_ID;
