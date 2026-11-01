const WATCHED_BRANDS = ["robinhood", "uniswap", "walletconnect", "metamask"] as const;
const MAX_EDIT_DISTANCE = 1;
const MIN_LABEL_LENGTH = 6;

export interface BrandLookalike {
  label: string;
  brand: (typeof WATCHED_BRANDS)[number];
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > MAX_EDIT_DISTANCE) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > MAX_EDIT_DISTANCE) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= MAX_EDIT_DISTANCE;
}

/**
 * Finds hostname labels with one insertion, deletion, or substitution from a watched brand.
 * This is a warning signal only; it does not establish ownership or malicious intent.
 */
export function findBrandLookalikes(host: string): BrandLookalike[] {
  const labels = host.toLowerCase().split(".");
  const findings: BrandLookalike[] = [];

  for (const hostnameLabel of labels) {
    if (hostnameLabel.startsWith("xn--")) continue;
    const candidates = hostnameLabel.split("-");
    for (const label of candidates) {
      if (label.length < MIN_LABEL_LENGTH) continue;
      for (const brand of WATCHED_BRANDS) {
        if (label === brand || !editDistanceAtMostOne(label, brand)) continue;
        findings.push({ label, brand });
        break;
      }
    }
  }
  return findings;
}
