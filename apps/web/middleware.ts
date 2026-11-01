import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce + hardening headers.
 * Trade-off: nonce CSP makes pages dynamically rendered. WalletConnect hosts are explicit and
 * enabled only when the project ID is configured; never wildcard them.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const walletConnectConfigured = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  const walletConnectConnectSrc = walletConnectConfigured
    ? " https://relay.walletconnect.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://rpc.walletconnect.org https://pulse.walletconnect.org https://explorer-api.walletconnect.com https://api.web3modal.org"
    : "";
  const walletConnectImgSrc = walletConnectConfigured ? " https://explorer-api.walletconnect.com" : "";
  const walletConnectFrameSrc = walletConnectConfigured ? " https://verify.walletconnect.org" : "";
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
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
