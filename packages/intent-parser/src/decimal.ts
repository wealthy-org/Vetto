/** Exact decimal <-> base-unit conversion. No floating point anywhere. */
export class DecimalError extends Error {}

const AMOUNT_RE = /^(\d+)(?:\.(\d+))?$/;
const GROUPED_RE = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

/** "10,000" -> "10000", ".5" -> "0.5". Throws on anything ambiguous. */
export function normalizeAmountText(input: string): string {
  let s = input.trim();
  if (s.includes(",")) {
    if (!GROUPED_RE.test(s)) throw new DecimalError(`Ambiguous number: "${input}"`);
    s = s.replace(/,/g, "");
  }
  if (s.startsWith(".")) s = `0${s}`;
  if (!AMOUNT_RE.test(s)) throw new DecimalError(`Invalid number: "${input}"`);
  return s;
}

export function parseDecimal(input: string, decimals: number): bigint {
  const m = AMOUNT_RE.exec(input.trim());
  if (!m) throw new DecimalError(`Invalid number: "${input}"`);
  const whole = m[1] ?? "0";
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new DecimalError(`Too many decimal places (max ${decimals})`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const s = (neg ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}
