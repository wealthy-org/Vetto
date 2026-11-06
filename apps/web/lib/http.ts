import { rateLimiter } from "./rate-limit";
import { failureFields } from "./setup-hints";

const MAX_BODY_BYTES = 4096;

export const jsonError = (status: number, error: string, extra?: Record<string, unknown>, headers?: HeadersInit) =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const jsonOk = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

let warnedProxy = false;
export function clientKey(req: Request): string {
  const hops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "0", 10);
  if (!(hops > 0)) {
    if (process.env.NODE_ENV === "production" && !warnedProxy) {
      warnedProxy = true;
      console.warn("TRUST_PROXY_HOPS is not set: all clients share one rate-limit bucket. Set it to the number of trusted proxies (e.g. 1 on Vercel).");
    }
    return "untrusted-proxy";
  }
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - hops] ?? "unknown-client";
}

/** Rate limit per klien untuk endpoint apa pun (termasuk GET). Mengembalikan Response error, atau null jika lolos. */
export async function limitClient(req: Request, scope: string, max = 60, windowMs = 60_000): Promise<Response | null> {
  try {
    const rl = await rateLimiter.hit(`${scope}:${clientKey(req)}`, max, windowMs);
    return rl.ok ? null : jsonError(429, "Too many requests. Try again shortly.", undefined, { "Retry-After": String(rl.retryAfterSec) });
  } catch (error) {
    console.error("API rate-limit store is unavailable:", error);
    return jsonError(503, "Request protection is temporarily unavailable.", failureFields(error));
  }
}

/**
 * Common guard for state-changing JSON endpoints: same-origin (CSRF), JSON only,
 * bounded body, per-client rate limit. Returns the parsed body or a ready-to-send error response.
 * Behind a reverse proxy set APP_ORIGIN (e.g. https://vetto.app) so the origin check stays exact.
 */
function headerValues(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Origins this deployment can legitimately be reached on.
 *
 * `APP_ORIGIN` wins when set (comma-separated lists are allowed, e.g. apex + www), but it
 * is no longer the *only* answer: a deployment behind a preview proxy, a custom domain and
 * a `*.vercel.app` host, or a TLS-terminating load balancer sees a different Host than the
 * one configured, and treating that as cross-origin locked users out of wallet sign-in.
 * The forwarded/host headers describe the host the browser actually used, so they are
 * included as well.
 */
export function expectedOrigins(req: Request): string[] {
  const origins = new Set<string>();

  for (const value of headerValues(process.env.APP_ORIGIN ?? null)) {
    for (const candidate of value.split(/[\s,]+/)) {
      const clean = candidate.replace(/\/+$/, "");
      if (clean) origins.add(clean);
    }
  }

  const url = new URL(req.url);
  origins.add(url.origin.toLowerCase());

  const hosts = [
    ...headerValues(req.headers.get("x-forwarded-host")),
    ...headerValues(req.headers.get("host")),
  ];

  for (const host of hosts) {
    // A proxy may rewrite the scheme, so both are accepted for a known host.
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }

  return [...origins];
}

let warnedPreviewOrigin = false;

/**
 * Preview embedding (VETTO_PREVIEW_EMBED=1) proxies the app through a host that rewrites
 * `Host`, so the public origin the browser used cannot always be derived from headers. In
 * that mode — and only there — the guard accepts any origin, because the alternative is a
 * sign-in flow that is simply broken in previews. It is logged once and documented as
 * preview-only; never enable it on a public deployment.
 */
function previewModeAllowsAnyOrigin(): boolean {
  const flag = (process.env.VETTO_PREVIEW_EMBED ?? "").trim().toLowerCase();
  const on = flag === "1" || flag === "true" || flag === "yes";
  if (on && !warnedPreviewOrigin) {
    warnedPreviewOrigin = true;
    console.warn(
      "VETTO_PREVIEW_EMBED is on: state-changing API routes accept any Origin for preview " +
        "proxying. Disable it before any public or funds-handling deployment.",
    );
  }
  return on;
}


function isLoopback(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

/**
 * The single origin to sign a SIWE message over.
 *
 * `APP_ORIGIN` wins (first entry if a list is provided) — a public deployment must pin it.
 * Otherwise it is derived from the forwarded host + proto so a preview proxy still gets a
 * real value; the caller decides whether that is acceptable in production.
 */
export function expectedOrigin(req: Request): string {
  const configured = (process.env.APP_ORIGIN ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .find(Boolean);
  const derived = deriveOrigin(req);
  const browserOrigin = normalizedOrigin(req.headers.get("origin"));

  if (configured) {
    const clean = configured.replace(/\/+$/, "");
    // A loopback APP_ORIGIN copied from a local .env cannot apply to a public preview host:
    // sign over the origin the browser is really on so the wallet shows a truthful domain.
    if (previewModeAllowsAnyOrigin() && isLoopback(clean)) {
      if (browserOrigin && !isLoopback(browserOrigin)) return browserOrigin;
      if (derived && !isLoopback(derived)) return derived;
    }
    return clean;
  }

  // No APP_ORIGIN: in preview the proxy may rewrite Host, so trust what the browser sent.
  if (previewModeAllowsAnyOrigin() && browserOrigin) return browserOrigin;

  return derived ?? new URL(req.url).origin;
}

/** The first configured APP_ORIGIN entry, trimmed — `undefined` when unset. */
export function configuredAppOrigin(): string | undefined {
  return (process.env.APP_ORIGIN ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .find(Boolean)
    ?.replace(/\/+$/, "");
}

/** The origin the request itself was addressed to, ignoring APP_ORIGIN. */
export function requestOriginOf(req: Request): string {
  return deriveOrigin(req) ?? new URL(req.url).origin;
}

/** True when the deployment is configured with a localhost origin. */
export function isLoopbackOrigin(origin: string): boolean {
  return isLoopback(origin);
}

/** The Origin header as a bare origin, when it parses. */
function normalizedOrigin(value: string | null): string | null {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Host + scheme the browser used, from the proxy headers when present. */
function deriveOrigin(req: Request): string | null {
  const host =
    headerValues(req.headers.get("x-forwarded-host"))[0] ??
    headerValues(req.headers.get("host"))[0];
  if (!host) return new URL(req.url).origin;

  const proto =
    headerValues(req.headers.get("x-forwarded-proto"))[0]?.replace(":", "") ??
    new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Same-origin check for state-changing endpoints (CSRF guard).
 *
 * Browsers set `Origin` themselves and cannot be spoofed by page scripts, so matching the
 * origin against the host this request was addressed to is the actual protection. The
 * scheme is compared too, but a host match is accepted as well because reverse proxies
 * routinely terminate TLS and forward plain http.
 */
export function isSameOrigin(req: Request, origin: string | null): boolean {
  const normalized = (origin ?? "").trim().replace(/\/+$/, "").toLowerCase();
  if (!normalized) return false;

  const candidates = expectedOrigins(req);
  if (candidates.includes(normalized)) return true;

  const host = hostOf(normalized);
  return host !== null && candidates.some((candidate) => hostOf(candidate) === host);
}

let warnedOriginMismatch = false;

/** Server-side only: log once what the proxy/browser disagreed about, so a deploy can be fixed. */
function noteOriginMismatch(req: Request, origin: string | null): void {
  if (warnedOriginMismatch) return;
  warnedOriginMismatch = true;
  console.warn(
    "Blocked a state-changing request from a mismatched origin.",
    JSON.stringify({
      origin,
      candidates: expectedOrigins(req),
      host: req.headers.get("host"),
      forwardedHost: req.headers.get("x-forwarded-host"),
      forwardedProto: req.headers.get("x-forwarded-proto"),
      appOrigin: process.env.APP_ORIGIN ?? null,
    }),
    "Set APP_ORIGIN to this deployment's public https origin if it is behind a proxy or custom domain.",
  );
}

export async function guardJson(req: Request, scope: string, max = 30, windowMs = 60_000): Promise<{ body: unknown } | { res: Response }> {
  const origin = req.headers.get("origin");
  // In preview the proxy may rewrite Host *and* drop Origin, so the flag bypasses both.
  const previewBypass = previewModeAllowsAnyOrigin();
  if (!isSameOrigin(req, origin) && !previewBypass) {
    noteOriginMismatch(req, origin);
    return {
      res: jsonError(403, "Cross-origin requests are not allowed.", {
        code: "ORIGIN_MISMATCH",
        hint:
          "The browser's Origin header did not match this deployment's host. Behind a proxy or a " +
          "custom domain, set APP_ORIGIN to the public https origin (e.g. https://vetto.app) and restart.",
      }),
    };
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return { res: jsonError(415, "Send application/json.") };

  const limited = await limitClient(req, scope, max, windowMs);
  if (limited) return { res: limited };

  // Reject oversized bodies from the header first, then verify the real size.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return { res: jsonError(413, "Request too large.") };
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { res: jsonError(413, "Request too large.") };
  try { return { body: JSON.parse(text) as unknown }; } catch { return { res: jsonError(400, "Invalid JSON.") }; }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);