import { english } from "viem/accounts";
import { detectSecret, secretMessage, type SecretKind } from "@vetto/safety-policy";

export { secretMessage, type SecretKind };

/** Wordlist BIP39 resmi dari viem (2048 kata), dibuat sekali. Hanya dipakai di server. */
const BIP39 = new Set<string>(english);

/** Cek penuh (private key + seed phrase). Pakai di setiap route yang menerima teks bebas. */
export const findSecret = (text: string): SecretKind | null => detectSecret(text, BIP39);