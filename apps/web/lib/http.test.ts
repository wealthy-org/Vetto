import assert from "node:assert/strict";
import { test } from "node:test";

import { expectedOrigin, expectedOrigins, isSameOrigin } from "./http.ts";

/** Builds a request the way a proxy would deliver it. */
function proxied(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers });
}

function withAppOrigin<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.APP_ORIGIN;
  if (value === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
}

test("isSameOrigin: accepts the origin the browser actually used when the bind address differs", () => {
  // `next start -H 0.0.0.0` behind a preview proxy: request.url says 0.0.0.0, the browser says the proxy host.
  const req = proxied("http://0.0.0.0:3000/api/auth/challenge", {
    host: "3000-abc123.e2b.app",
    "x-forwarded-proto": "https",
  });
  assert.equal(isSameOrigin(req, "https://3000-abc123.e2b.app"), true);
});

test("isSameOrigin: accepts a TLS-terminating proxy that forwards plain http", () => {
  const req = proxied("http://internal:3000/api/auth/challenge", {
    "x-forwarded-host": "vetto.app",
    "x-forwarded-proto": "http",
  });
  assert.equal(isSameOrigin(req, "https://vetto.app"), true);
});

test("isSameOrigin: accepts a stale APP_ORIGIN only for the real host, never for a foreign one", () => {
  withAppOrigin("http://127.0.0.1:3000", () => {
    const req = proxied("http://0.0.0.0:3000/api/auth/challenge", {
      "x-forwarded-host": "vetto.vercel.app",
      "x-forwarded-proto": "https",
    });
    assert.equal(isSameOrigin(req, "https://vetto.vercel.app"), true);
    assert.equal(isSameOrigin(req, "https://evil.example"), false);
    assert.equal(isSameOrigin(req, null), false);
  });
});

test("isSameOrigin: rejects foreign origins and scheme+host mismatches from other hosts", () => {
  const req = proxied("http://127.0.0.1:3000/api/auth/challenge", { host: "127.0.0.1:3000" });
  assert.equal(isSameOrigin(req, "http://127.0.0.1:3000"), true);
  assert.equal(isSameOrigin(req, "https://evil.example"), false);
  assert.equal(isSameOrigin(req, "http://127.0.0.1:4000"), false);
  assert.equal(isSameOrigin(req, ""), false);
});

test("isSameOrigin: tolerates a trailing slash and header casing", () => {
  const req = proxied("http://127.0.0.1:3000/api/auth/challenge", { host: "127.0.0.1:3000" });
  assert.equal(isSameOrigin(req, "HTTP://127.0.0.1:3000/"), true);
});

test("isSameOrigin: accepts every host in a comma-separated x-forwarded-host", () => {
  const req = proxied("http://internal:3000/api/auth/challenge", {
    "x-forwarded-host": "vetto.app, vetto-git-main.vercel.app",
    "x-forwarded-proto": "https",
  });
  assert.equal(isSameOrigin(req, "https://vetto-git-main.vercel.app"), true);
  assert.equal(isSameOrigin(req, "https://vetto.app"), true);
});

test("expectedOrigins: APP_ORIGIN may list several origins (apex + www)", () => {
  withAppOrigin("https://vetto.app, https://www.vetto.app/", () => {
    const origins = expectedOrigins(proxied("http://127.0.0.1:3000/x"));
    assert.ok(origins.includes("https://vetto.app"));
    assert.ok(origins.includes("https://www.vetto.app"));
  });
});

test("expectedOrigin: APP_ORIGIN wins, otherwise it is derived from the forwarded host", () => {
  withAppOrigin("https://vetto.app/", () => {
    assert.equal(expectedOrigin(proxied("http://0.0.0.0:3000/x", { "x-forwarded-host": "other.app" })), "https://vetto.app");
  });
  withAppOrigin(undefined, () => {
    const req = proxied("http://0.0.0.0:3000/x", { "x-forwarded-host": "vetto.app", "x-forwarded-proto": "https" });
    assert.equal(expectedOrigin(req), "https://vetto.app");
  });
  withAppOrigin(undefined, () => {
    const req = proxied("http://127.0.0.1:3000/x", { host: "127.0.0.1:3000" });
    assert.equal(expectedOrigin(req), "http://127.0.0.1:3000");
  });
});

function withPreviewFlag<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.VETTO_PREVIEW_EMBED;
  if (value === undefined) delete process.env.VETTO_PREVIEW_EMBED;
  else process.env.VETTO_PREVIEW_EMBED = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.VETTO_PREVIEW_EMBED;
    else process.env.VETTO_PREVIEW_EMBED = previous;
  }
}

test("guardJson: preview mode proxy (rewritten Host) still reaches the handler", async () => {
  const { guardJson } = await import("./http.ts");
  await withPreviewFlag("1", async () => {
    // The preview proxy delivers the request with an internal Host and a public Origin.
    const req = new Request("http://127.0.0.1:3000/api/auth/challenge", {
      method: "POST",
      headers: { origin: "https://3000-preview.e2b.app", "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const guarded = await guardJson(req, "test-preview", 100);
    assert.ok("body" in guarded, "preview requests must not be rejected as cross-origin");
  });
});

test("guardJson: without the preview flag the same request is still refused", async () => {
  const { guardJson } = await import("./http.ts");
  await withPreviewFlag(undefined, async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/challenge", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const guarded = await guardJson(req, "test-strict", 100);
    assert.ok("res" in guarded);
    assert.equal(guarded.res.status, 403);
  });
});

test("expectedOrigin: preview mode signs over the real host when APP_ORIGIN is loopback", () => {
  withPreviewFlag("1", () => {
    withAppOrigin("http://127.0.0.1:3000", () => {
      const req = proxied("http://127.0.0.1:3000/x", {
        "x-forwarded-host": "3000-preview.e2b.app",
        "x-forwarded-proto": "https",
      });
      assert.equal(expectedOrigin(req), "https://3000-preview.e2b.app");
    });
  });
  withPreviewFlag(undefined, () => {
    withAppOrigin("http://127.0.0.1:3000", () => {
      const req = proxied("http://127.0.0.1:3000/x", {
        "x-forwarded-host": "3000-preview.e2b.app",
        "x-forwarded-proto": "https",
      });
      assert.equal(expectedOrigin(req), "http://127.0.0.1:3000");
    });
  });
});

test("expectedOrigin: preview mode falls back to the browser Origin when the proxy rewrote Host", () => {
  withPreviewFlag("1", () => {
    withAppOrigin("http://127.0.0.1:3000", () => {
      const req = new Request("http://127.0.0.1:3000/x", {
        headers: { host: "internal-10.0.0.5:3000", origin: "https://3000-preview.e2b.app" },
      });
      assert.equal(expectedOrigin(req), "https://3000-preview.e2b.app");
    });
    withAppOrigin(undefined, () => {
      const req = new Request("http://127.0.0.1:3000/x", {
        headers: { host: "internal-10.0.0.5:3000", origin: "https://3000-preview.e2b.app" },
      });
      assert.equal(expectedOrigin(req), "https://3000-preview.e2b.app");
    });
  });
});

test("expectedOrigin: without preview mode a loopback APP_ORIGIN is still honoured verbatim", () => {
  withPreviewFlag(undefined, () => {
    withAppOrigin("http://127.0.0.1:3000", () => {
      const req = new Request("http://127.0.0.1:3000/x", {
        headers: { host: "internal:3000", origin: "https://vetto.app" },
      });
      assert.equal(expectedOrigin(req), "http://127.0.0.1:3000");
    });
  });
});

test("guardJson: a proxy that strips Origin still works in preview, and is refused otherwise", async () => {
  const { guardJson } = await import("./http.ts");
  const body = JSON.stringify({ ok: true });
  await withPreviewFlag("1", async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.ok("body" in (await guardJson(req, "test-strip-preview", 100)));
  });
  await withPreviewFlag(undefined, async () => {
    const req = new Request("http://127.0.0.1:3000/api/auth/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const guarded = await guardJson(req, "test-strip-strict", 100);
    assert.ok("res" in guarded);
    assert.equal(guarded.res.status, 403);
  });
});

test("configuredAppOrigin / requestOriginOf: expose the configured origin and the real request host", async () => {
  const { configuredAppOrigin, requestOriginOf } = await import("./http.ts");
  withAppOrigin(" https://vetto.app/ , https://www.vetto.app ", () => {
    assert.equal(configuredAppOrigin(), "https://vetto.app");
  });
  withAppOrigin(undefined, () => {
    assert.equal(configuredAppOrigin(), undefined);
  });
  const req = new Request("http://0.0.0.0:3000/api/x", {
    headers: { "x-forwarded-host": "vetto.vercel.app", "x-forwarded-proto": "https" },
  });
  assert.equal(requestOriginOf(req), "https://vetto.vercel.app");
});
