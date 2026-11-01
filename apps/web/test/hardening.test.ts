import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey } from "../lib/http.ts";
import { checkHostDns, setHostResolver } from "../lib/dns-check.ts";
import { POST as inspect } from "../app/api/inspect/route.ts";
import { GET as session } from "../app/api/auth/session/route.ts";
import { AUTH_SESSION_COOKIE } from "../lib/wallet-auth.ts";

const BASE = "http://localhost:3000";
const req = (xff?: string) => new Request(`${BASE}/x`, { headers: xff ? { "x-forwarded-for": xff } : {} });
const withHops = (hops: string | undefined, fn: () => void) => {
  const before = process.env.TRUST_PROXY_HOPS;
  if (hops === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = hops;
  try { fn(); } finally { if (before === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = before; }
};

test("clientKey: without TRUST_PROXY_HOPS the header is ignored (cannot be spoofed)", () => {
  withHops(undefined, () => {
    assert.equal(clientKey(req("1.1.1.1")), "untrusted-proxy");
    assert.equal(clientKey(req("2.2.2.2")), "untrusted-proxy");
  });
  withHops("0", () => assert.equal(clientKey(req("1.1.1.1")), "untrusted-proxy"));
});

test("clientKey: takes the Nth entry from the right, so client-prepended entries are ignored", () => {
  withHops("1", () => {
    assert.equal(clientKey(req("203.0.113.7")), "203.0.113.7");
    assert.equal(clientKey(req("6.6.6.6, 203.0.113.7")), "203.0.113.7"); // klien menambahkan 6.6.6.6
  });
  withHops("2", () => assert.equal(clientKey(req("6.6.6.6, 203.0.113.7, 10.0.0.1")), "203.0.113.7"));
  withHops("2", () => assert.equal(clientKey(req("203.0.113.7")), "unknown-client")); // lebih pendek dari jumlah proxy
  withHops("1", () => assert.equal(clientKey(req()), "unknown-client"));
});

test("DNS: public, private (rebinding), mixed answers, failure and timeout", async () => {
  setHostResolver(async () => ["93.184.216.34"]);
  assert.deepEqual(await checkHostDns("ok.example"), { status: "public" });
  setHostResolver(async () => ["10.0.0.5"]);
  assert.equal((await checkHostDns("rebind.example")).status, "private");
  setHostResolver(async () => ["93.184.216.34", "169.254.169.254"]);
  assert.equal((await checkHostDns("mixed.example")).status, "private");
  setHostResolver(async () => { throw new Error("ENOTFOUND"); });
  assert.deepEqual(await checkHostDns("nope.example"), { status: "unresolved" });
  setHostResolver(() => new Promise(() => {})); // tidak pernah selesai
  assert.deepEqual(await checkHostDns("slow.example", 30), { status: "unresolved" });
  setHostResolver(null);
});

const inspectReq = (url: string, ip: string) =>
  new Request(`${BASE}/api/inspect`, { method: "POST", headers: { origin: BASE, "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ url }) });

test("/api/inspect: a public-looking name that resolves to a private IP is critical/dangerous", async () => {
  setHostResolver(async () => ["10.1.2.3"]);
  const b = await (await inspect(inspectReq("https://totally-normal.example/", "10.7.0.1"))).json() as any;
  assert.equal(b.report.band, "dangerous");
  assert.ok(b.report.findings.some((f: any) => f.id === "dns-private" && f.severity === "critical"));
});

test("/api/inspect: resolvable public host lists the DNS check; unresolvable one lists it as unavailable", async () => {
  setHostResolver(async () => ["93.184.216.34"]);
  const ok = await (await inspect(inspectReq("https://demo-dex.app/", "10.7.0.2"))).json() as any;
  assert.ok(ok.report.checksRun.includes("DNS resolves to public addresses"));
  assert.equal(ok.report.band, "insufficient evidence");
  setHostResolver(async () => { throw new Error("ENOTFOUND"); });
  const bad = await (await inspect(inspectReq("https://demo-dex.app/", "10.7.0.3"))).json() as any;
  assert.ok(bad.report.checksUnavailable.includes("DNS resolution"));
  assert.ok(bad.report.findings.some((f: any) => f.id === "dns-unresolved"));
  setHostResolver(null);
});

test("/api/auth/session: no cookie is free; with a cookie it is rate limited (429) before touching the database", async () => {
  const noCookie = await session(new Request(`${BASE}/api/auth/session`, { headers: { "x-forwarded-for": "10.8.0.1" } }));
  assert.deepEqual(await noCookie.json(), { authenticated: false });
  const cookie = `${AUTH_SESSION_COOKIE}=${"a".repeat(43)}`;
  const hit = () => session(new Request(`${BASE}/api/auth/session`, { headers: { "x-forwarded-for": "10.8.0.2", cookie } }));
  let last = await hit();
  for (let i = 0; i < 120; i++) last = await hit();
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) >= 1);
});