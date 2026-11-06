import { encodeFunctionData, getAddress, type Address } from "viem";

import { CONTRACTS, ERC20_ABI, PERMIT2_ABI, rpcClient, rpcUrls } from "./robinhood-chain";

/**
 * Permit2 approval planner.
 *
 * A v4 swap of an ERC-20 has two separate allowances and, when either is short, the swap
 * cannot be built at all:
 *
 *   1. ERC-20 `approve(Permit2, amount)` — lets Permit2 move the token at all.
 *   2. `Permit2.approve(token, UniversalRouter, amount, expiration)` — lets the router pull
 *      that token through Permit2, until `expiration`.
 *
 * VETTO never signs and never batches these into the swap: the plan is returned as plain,
 * unsigned transactions the wallet must approve one by one, and the swap is only offered
 * again after the chain reports the allowance as sufficient. Every byte of calldata is
 * built here, from the server-side intent — nothing comes from the browser.
 */

const ROUTER: Address = CONTRACTS.universalRouter;
const PERMIT2: Address = CONTRACTS.permit2;

/** How long a Permit2 grant lasts. Long, but finite: an expired grant is re-planned. */
export const PERMIT2_APPROVAL_WINDOW_SECONDS = 60 * 60 * 24 * 30;

export interface ApprovalStep {
  /** What the wallet is being asked to do, in the user's words. */
  purpose: "erc20-approve-permit2" | "permit2-approve-router";
  narration: string;
  to: Address;
  data: string;
  value: "0";
  /** Human-readable decode of the call, so the review never asks for a blind signature. */
  call: { method: string; args: Record<string, string> };
}

export interface AllowanceSnapshot {
  token: Address;
  owner: Address;
  /** ERC-20 allowance the token contract grants Permit2. */
  tokenToPermit2: bigint;
  /** Permit2 allowance the router may pull, and when it expires. */
  permit2ToRouter: bigint;
  permit2Expiration: number;
  required: bigint;
  /** Unix seconds, server clock, used for the expiration check. */
  nowSeconds: number;
}

export interface ApprovalPlan {
  satisfied: boolean;
  snapshot: AllowanceSnapshot;
  steps: ApprovalStep[];
}

/**
 * Reads both allowances at one block. Kept separate from the plan builder so the same call
 * can answer "is the wallet ready yet?" while the client waits for a receipt.
 */
export async function readAllowances(input: {
  token: Address;
  owner: Address;
  required: bigint;
  now?: number;
}): Promise<AllowanceSnapshot> {
  const urls = rpcUrls();
  const client = rpcClient(urls.primary);
  const blockNumber = await client.getBlockNumber();
  const nowSeconds = input.now ?? Math.floor(Date.now() / 1000);

  const [tokenToPermit2, permit2] = await Promise.all([
    client.readContract({
      address: input.token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [input.owner, PERMIT2],
      blockNumber,
    }),
    client.readContract({
      address: PERMIT2,
      abi: PERMIT2_ABI,
      functionName: "allowance",
      args: [input.owner, input.token, ROUTER],
      blockNumber,
    }),
  ]);

  return {
    token: getAddress(input.token),
    owner: getAddress(input.owner),
    tokenToPermit2,
    permit2ToRouter: permit2[0],
    permit2Expiration: Number(permit2[1]),
    required: input.required,
    nowSeconds,
  };
}

/** Pure: which approvals are still missing, and the exact calldata to fix them. */
export function planApprovals(snapshot: AllowanceSnapshot): ApprovalPlan {
  const steps: ApprovalStep[] = [];
  const token = getAddress(snapshot.token);

  if (snapshot.tokenToPermit2 < snapshot.required) {
    steps.push({
      purpose: "erc20-approve-permit2",
      narration:
        `Let Permit2 move this token for you. This approves exactly the amount you are ` +
        `swapping, on this token only — it does not approve the router and it cannot move ` +
        `anything else.`,
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PERMIT2, snapshot.required],
      }),
      value: "0",
      call: {
        method: "approve(address spender, uint256 amount)",
        args: { spender: PERMIT2, amount: snapshot.required.toString() },
      },
    });
  }

  const expired = snapshot.permit2Expiration <= snapshot.nowSeconds;
  if (snapshot.permit2ToRouter < snapshot.required || expired) {
    const expiration = snapshot.nowSeconds + PERMIT2_APPROVAL_WINDOW_SECONDS;
    steps.push({
      purpose: "permit2-approve-router",
      narration:
        `Let the Uniswap router pull this token through Permit2 for the next 30 days. ` +
        `It is limited to the amount shown and expires on its own.`,
      to: PERMIT2,
      data: encodeFunctionData({
        abi: PERMIT2_ABI,
        functionName: "approve",
        args: [token, ROUTER, snapshot.required, expiration],
      }),
      value: "0",
      call: {
        method: "approve(address token, address spender, uint160 amount, uint48 expiration)",
        args: {
          token,
          spender: ROUTER,
          amount: snapshot.required.toString(),
          expiration: expiration.toString(),
        },
      },
    });
  }

  return { satisfied: steps.length === 0, snapshot, steps };
}

/** True when both allowances currently cover the swap at `snapshot.nowSeconds`. */
export function allowancesSatisfied(snapshot: AllowanceSnapshot): boolean {
  return (
    snapshot.tokenToPermit2 >= snapshot.required &&
    snapshot.permit2ToRouter >= snapshot.required &&
    snapshot.permit2Expiration > snapshot.nowSeconds
  );
}
