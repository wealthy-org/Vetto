import { authenticatedUserId } from "@/lib/authenticated-user";
import { getPool } from "@/lib/db";
import { guardJson, isRecord, jsonError, jsonOk } from "@/lib/http";
import { allowancesSatisfied, planApprovals, readAllowances } from "@/lib/permit2-approval";
import { networkLabel } from "@/lib/chain-label";
import { WALLET_NOT_LINKED_ON_THIS_CHAIN, pickLinkedWallet, walletLinkMessage } from "@/lib/linked-wallet";
import { ROBINHOOD_CHAIN_ID } from "@/lib/robinhood-chain";
import { findAsset } from "@vetto/asset-registry";
import { IntentValidationError, parseDecimal, validateIntent } from "@vetto/intent-parser";

export const runtime = "nodejs";

interface WalletRow {
  address: string;
  chain_id: string;
}

/**
 * Permit2 approvals are a separate, wallet-signed step before a swap.
 *
 *   POST { action: "plan",   intent }            → the unsigned approval txs still missing
 *   POST { action: "status", intent }            → just the current allowance state
 *
 * Nothing here signs or broadcasts: the browser sends each transaction through the user's
 * own wallet, and the swap is only prepared again once `status` reports both allowances as
 * sufficient. Selling the native asset (ETH) needs no approval at all.
 */
export async function POST(request: Request) {
  const guarded = await guardJson(request, "permit2-approval", 60);
  if ("res" in guarded) return guarded.res;
  if (!isRecord(guarded.body)) return jsonError(400, "Expected { action, intent }.");

  const action = guarded.body.action;
  if (action !== "plan" && action !== "status") {
    return jsonError(400, "action must be \"plan\" or \"status\".");
  }

  let intent;
  try {
    intent = validateIntent(guarded.body.intent);
  } catch (error) {
    return jsonError(400, error instanceof IntentValidationError ? error.message : "Invalid intent.");
  }

  if (intent.kind !== "swap") return jsonError(422, "Only swap intents need approvals.");

  const tokenIn = findAsset(intent.tokenIn);
  if (!tokenIn) return jsonError(422, "Unknown input asset.");

  // Native ETH is the input: the router pulls it with `msg.value`, so no allowance exists.
  if (tokenIn.address === null || tokenIn.address === "native") {
    return jsonOk({
      chainId: ROBINHOOD_CHAIN_ID,
      token: null,
      required: false,
      satisfied: true,
      steps: [],
      note: "The input asset is native ETH: no Permit2 approval is needed.",
    });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return jsonError(503, "Database is unavailable.");

  let userId: string | null;
  try {
    userId = await authenticatedUserId(request);
  } catch {
    return jsonError(503, "Authentication service is unavailable.");
  }
  if (!userId) return jsonError(401, "Sign in before approving a token.");

  const wallet = await getPool(databaseUrl).query<WalletRow>(
    `select address, chain_id
     from wallet_identities
     where user_id = $1
     order by last_seen_at desc`,
    [userId],
  );

  const link = pickLinkedWallet(wallet.rows, ROBINHOOD_CHAIN_ID);
  if (!link.wallet) {
    return jsonError(409, walletLinkMessage(link, networkLabel(), ROBINHOOD_CHAIN_ID), {
      code: WALLET_NOT_LINKED_ON_THIS_CHAIN,
      linkedChains: link.otherChainIds,
    });
  }

  const linked = { address: link.wallet.address, chain_id: String(link.wallet.chainId) };

  const required = parseDecimal(intent.amountIn, tokenIn.decimals);

  try {
    const snapshot = await readAllowances({
      token: tokenIn.address as `0x${string}`,
      owner: linked.address as `0x${string}`,
      required,
    });
    const plan = planApprovals(snapshot);
    const satisfied = allowancesSatisfied(snapshot);

    return jsonOk({
      chainId: ROBINHOOD_CHAIN_ID,
      token: tokenIn.symbol,
      tokenAddress: snapshot.token,
      wallet: snapshot.owner,
      required: snapshot.required.toString(),
      tokenToPermit2: snapshot.tokenToPermit2.toString(),
      permit2ToRouter: snapshot.permit2ToRouter.toString(),
      permit2Expiration: snapshot.permit2Expiration,
      satisfied,
      steps: satisfied ? [] : plan.steps,
      note: satisfied
        ? "Both allowances already cover this swap."
        : action === "plan"
          ? "Send these approvals with your wallet, then prepare the swap again."
          : "Allowances are still being confirmed. Give the chain a moment.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : "Allowance read failed.";
    return jsonError(502, `Could not read the token allowance from the chain: ${message}`);
  }
}
