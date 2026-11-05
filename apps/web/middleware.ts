import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce + hardening headers.
 * Trade-off: nonce CSP makes pages dynamically rendered. WalletConnect hosts are explicit and
 * enabled only when the project ID is configured; never wildcard them.
 *
 * Framing is refused by default (`frame-ancestors 'none'` + `X-Frame-Options: DENY`). A demo or
 * preview deployment that must render inside a hosted iframe can opt in explicitly with
 * VETTO_PREVIEW_EMBED=1; that relaxation is logged once and must never be used for a public
 * deployment that handles real funds.
 */

let warnedPreviewEmbed = false;

function previewEmbeddingEnabled(): boolean {
  const flag = (process.env.VETTO_PREVIEW_EMBED ?? "").trim().toLowerCase();
  const enabled = flag === "1" || flag === "true" || flag === "on";
  if (enabled && !warnedPreviewEmbed) {
    warnedPreviewEmbed = true;
    console.warn(
      "VETTO_PREVIEW_EMBED is on: pages may be framed by another origin for preview purposes. " +
        "Disable it before any public or funds-handling deployment.",
    );
  }
  return enabled;
}
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const walletConnectConfigured = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  const walletConnectConnectSrc = walletConnectConfigured
    ? " https://relay.walletconnect.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://explorer-api.walletconnect.com https://api.web3modal.org"
    : "";
  const walletConnectImgSrc = walletConnectConfigured ? " https://explorer-api.walletconnect.com" : "";
  const walletConnectFrameSrc = walletConnectConfigured ? " https://verify.walletconnect.org" : "";
  const embeddable = previewEmbeddingEnabled();
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // GSAP/React write inline styles; no inline <script> is allowed
    `img-src 'self' data: blob:${walletConnectImgSrc}`,
    `font-src 'self' data:${walletConnectConfigured ? " https://fonts.reown.com" : ""}`,
    `connect-src 'self'${walletConnectConnectSrc}`,
    `frame-src 'self'${walletConnectFrameSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    // A preview host embeds the app from its own origin, so allow https ancestors
    // only when explicitly opted in; otherwise nothing may frame VETTO.
    embeddable ? "frame-ancestors 'self' https:" : "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  // X-Frame-Options has no notion of "https only"; omit it instead of claiming SAMEORIGIN,
  // which would be untrue. The CSP frame-ancestors directive above stays authoritative.
  if (!embeddable) res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
