/**
 * Detektor rahasia di teks bebas pengguna (brief §1/§5/§20: VETTO tidak pernah menerima,
 * menampilkan ulang, atau menyimpan seed phrase / private key).
 *
 * Zero-dependency. Deteksi seed phrase butuh wordlist BIP39 yang DISUNTIKKAN pemanggil
 * (di apps/web dari `viem/accounts`), supaya paket ini tetap tanpa dependency.
 */
export type SecretKind = "private-key" | "seed-phrase";

/** 64 hex mandiri (dengan/tanpa 0x). Alamat (40 hex) dan 65+ hex tidak cocok berkat batas lookaround. */
const HEX_KEY = /(?<![0-9a-fA-F])(?:0[xX])?[0-9a-fA-F]{64}(?![0-9a-fA-F])/;
const PEM_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const EXTENDED_KEY = /(?<![A-HJ-NP-Za-km-z0-9])(?:[xyzt]prv)[1-9A-HJ-NP-Za-km-z]{100,}/i;

const WINDOW = 12; // panjang minimum frasa BIP39
const MIN_HITS = 11; // toleransi satu kata salah ketik

export function detectSecret(text: string, bip39Words?: ReadonlySet<string>): SecretKind | null {
  if (HEX_KEY.test(text) || PEM_KEY.test(text) || EXTENDED_KEY.test(text)) return "private-key";
  if (!bip39Words) return null;

  const tokens = text.toLowerCase().match(/[a-z]+/g);
  if (!tokens || tokens.length < WINDOW) return null;
  // jendela geser 12 token: jumlah token yang ada di wordlist BIP39
  const hit = tokens.map((t) => (bip39Words.has(t) ? 1 : 0));
  let sum = 0;
  for (let i = 0; i < hit.length; i++) {
    sum += hit[i]!;
    if (i >= WINDOW) sum -= hit[i - WINDOW]!;
    if (i >= WINDOW - 1 && sum >= MIN_HITS) return "seed-phrase";
  }
  return null;
}

export function secretMessage(kind: SecretKind): string {
  if (kind === "seed-phrase") {
    return "That looks like a seed phrase. VETTO never needs one, so it was not processed, repeated, or saved. If it was real, treat it as compromised and move your funds to a new wallet.";
  }
  return "That looks like a private key or another sensitive 64-character hex value. VETTO did not process, repeat, or save it. If it was a private key, treat it as compromised and move your funds to a new wallet. If it was a transaction hash, open it using your explorer.";
}