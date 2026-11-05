import { formatUnits } from "@vetto/intent-parser";

/**
 * Display-only amount formatting. Never used for decisions: exact base units are
 * what the review panel and the transaction carry.
 *
 * Long tail decimals (18-decimal ETH) get truncated to at most `maxFraction`
 * digits so a card cannot overflow, without rounding up past what you receive.
 */
export function formatAmount(
  baseUnits: string | bigint,
  decimals: number,
  maxFraction = 6,
): string {
  const value = typeof baseUnits === "string" ? BigInt(baseUnits) : baseUnits;

  if (decimals <= maxFraction) {
    return trimZeros(formatUnits(value, decimals));
  }

  if (value === 0n) return "0";

  const divisor = 10n ** BigInt(decimals - maxFraction);
  const truncated = value / divisor;
  const text = trimZeros(formatUnits(truncated, maxFraction));
  // Non-zero but below the display floor: say so instead of printing a misleading 0,
  // and match the label to the precision actually asked for.
  return text === "0" ? `<${trimZeros(formatUnits(1n, maxFraction))}` : text;
}

function trimZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}
