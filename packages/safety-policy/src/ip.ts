/** IP classification used by the SSRF guard (pre-fetch) and the DNS-pinning check (post-resolve). */
export function parseIPv4(s: string): [number, number, number, number] | null {
  const p = s.split(".");
  if (p.length !== 4) return null;
  const n = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  if (n.some((x) => !(x >= 0 && x <= 255))) return null;
  return n as [number, number, number, number];
}

function isPublicIPv4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false;                       // this-net, private, loopback
  if (a === 100 && b! >= 64 && b! <= 127) return false;                     // CGNAT
  if (a === 169 && b === 254) return false;                                // link-local + cloud metadata
  if (a === 172 && b! >= 16 && b! <= 31) return false;                     // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;          // IETF + TEST-NET-1
  if (a === 192 && b === 168) return false;                                 // private
  if (a === 198 && (b === 18 || b === 19)) return false;                    // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;                     // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false;                      // TEST-NET-3
  return a! < 224;                                                          // multicast / reserved
}

export function parseIPv6(input: string): number[] | null {
  let s = input.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (s.includes(".")) {
    const i = s.lastIndexOf(":");
    const v4 = parseIPv4(s.slice(i + 1));
    if (!v4) return null;
    s = `${s.slice(0, i + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const parts = s.split("::");
  if (parts.length > 2) return null;
  const groups = (x: string) => (x === "" ? [] : x.split(":"));
  const head = groups(parts[0]!);
  const tail = parts.length === 2 ? groups(parts[1]!) : [];
  if (parts.length === 1 && head.length !== 8) return null;
  if (parts.length === 2 && head.length + tail.length > 7) return null;
  const fill = parts.length === 2 ? Array<string>(8 - head.length - tail.length).fill("0") : [];
  const all = [...head, ...fill, ...tail];
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && !nums.some(Number.isNaN) ? nums : null;
}

function isPublicIPv6(g: number[]): boolean {
  const v4from = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && g[5] === 0xffff) return isPublicIPv4(v4from(g[6]!, g[7]!));   // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isPublicIPv4(v4from(g[6]!, g[7]!)); // NAT64
  if ((g[0]! & 0xe000) !== 0x2000) return false;                                    // only 2000::/3 (global unicast)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;                             // documentation
  return true;
}

export function isPublicIp(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(ip);
  return v6 ? isPublicIPv6(v6) : false; // unparseable => not public (fail closed)
}
