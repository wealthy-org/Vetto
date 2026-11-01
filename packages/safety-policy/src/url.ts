import { isPublicIp, parseIPv4 } from "./ip.ts";

export type UrlCheck = { ok: true; url: URL; host: string } | { ok: false; reason: string };
const no = (reason: string): UrlCheck => ({ ok: false, reason });

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".localdomain", ".home.arpa"];

/**
 * Static SSRF policy applied BEFORE any network I/O. WHATWG URL parsing already normalises
 * decimal/hex/octal IPv4 forms ("http://2130706433" -> 127.0.0.1), so we validate the parsed host.
 *
 * This is necessary but not sufficient: the worker must also resolve DNS itself, run
 * `checkResolvedIps()`, and connect to the pinned IP (DNS-rebinding defence), re-checking every redirect hop.
 */
export function checkPublicUrl(input: unknown): UrlCheck {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return no("Link is missing or too long.");
  let u: URL;
  try { u = new URL(input); } catch { return no("That doesn't look like a valid link."); }
  if (u.protocol !== "https:") return no("Only https:// sites can be checked.");
  if (u.username || u.password) return no("Links with embedded credentials are rejected.");
  if (u.port && u.port !== "443") return no("Non-standard ports are not allowed.");

  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    return isPublicIp(host.slice(1, -1)) ? { ok: true, url: u, host } : no("Private or reserved addresses are blocked.");
  }
  if (parseIPv4(host)) {
    return isPublicIp(host) ? { ok: true, url: u, host } : no("Private or reserved addresses are blocked.");
  }
  if (!host.includes(".")) return no("Internal single-label hosts are blocked.");
  if (BLOCKED_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s))) return no("Internal hostnames are blocked.");
  if (!/^[a-z0-9.-]+$/.test(host) || !/^(?:[a-z]{2,24}|xn--[a-z0-9-]+)$/.test(host.split(".").pop()!)) return no("Hostname is not valid.");
  u.hash = "";
  return { ok: true, url: u, host };
}

/** Run on the addresses a hostname resolved to. One private answer poisons the set (rebinding). */
export function checkResolvedIps(ips: readonly string[]): { ok: boolean; reason?: string } {
  if (ips.length === 0) return { ok: false, reason: "Hostname did not resolve." };
  const bad = ips.find((ip) => !isPublicIp(ip));
  return bad ? { ok: false, reason: `Resolved to a non-public address (${bad}).` } : { ok: true };
}
