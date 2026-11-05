import { createHash, randomBytes } from "node:crypto";
import { getAddress, isHex, type Address, type Hex } from "viem";
import { WALLET_AUTH_CHAIN_ID, isWalletAuthChainId } from "./auth-constants";

export { WALLET_AUTH_CHAIN_ID, WALLET_AUTH_CHAIN_IDS, isWalletAuthChainId } from "./auth-constants";
export const AUTH_CHALLENGE_TTL_SECONDS = 5 * 60;
export const AUTH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTH_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-vetto_session"
  : "vetto_session";

export function normalizeWalletAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

export function normalizeSignature(value: unknown): Hex | null {
  return typeof value === "string" && isHex(value) && value.length === 132 ? value : null;
}

export function makeSiweMessage(input: {
  domain: string;
  uri: string;
  address: Address;
  chainId?: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  const chainId = input.chainId ?? WALLET_AUTH_CHAIN_ID;
  if (!isWalletAuthChainId(chainId)) throw new Error("Unsupported wallet authentication chain.");
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    "",
    "Sign in to VETTO. This does not authorize token transfers or any transaction.",
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

/** Allowlisted wallet labels. Display only — never an authorization input. */
export const WALLET_CONNECTORS = [
  "phantom",
  "metamask",
  "rabby",
  "coinbase",
  "walletconnect",
  "injected",
] as const;

export type WalletConnector = (typeof WALLET_CONNECTORS)[number];

export function normalizeConnector(value: unknown): WalletConnector | null {
  if (typeof value !== "string") return null;
  const lower = value.trim().toLowerCase();
  return (WALLET_CONNECTORS as readonly string[]).includes(lower) ? (lower as WalletConnector) : null;
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function makeSessionCookie(token: string, maxAge = AUTH_SESSION_TTL_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const prefix = `${AUTH_SESSION_COOKIE}=`;
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  const token = entry?.slice(prefix.length);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
