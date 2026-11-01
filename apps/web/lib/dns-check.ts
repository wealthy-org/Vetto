import { lookup } from "node:dns/promises";
import { checkResolvedIps } from "@vetto/safety-policy";

export type HostResolver = (host: string) => Promise<string[]>;

const systemResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

let resolver: HostResolver = systemResolver;
/** Hanya untuk tes: mengganti resolver agar tidak bergantung pada jaringan. Panggil dengan null untuk reset. */
export function setHostResolver(next: HostResolver | null): void {
  resolver = next ?? systemResolver;
}

export type DnsCheck =
  | { status: "public" }
  | { status: "private"; reason: string }
  | { status: "unresolved" };

/**
 * Pertahanan DNS-rebinding (brief §8.1). Hanya BERTANYA ke DNS; situs target tidak pernah dihubungi.
 * Satu jawaban privat meracuni seluruh set (lihat checkResolvedIps). Worker Phase 3 tetap wajib
 * me-resolve sendiri, mem-pin IP, dan memeriksa ulang setiap redirect.
 */
export async function checkHostDns(host: string, timeoutMs = 3000): Promise<DnsCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ips = await Promise.race([
      resolver(host),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("dns timeout")), timeoutMs); }),
    ]);
    const verdict = checkResolvedIps(ips);
    return verdict.ok ? { status: "public" } : { status: "private", reason: verdict.reason ?? "Resolved to a non-public address." };
  } catch {
    return { status: "unresolved" };
  } finally {
    clearTimeout(timer);
  }
}