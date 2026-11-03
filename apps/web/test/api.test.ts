
import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as intent } from "../app/api/intent/route.ts";
import { POST as quotes } from "../app/api/quotes/route.ts";
import { POST as inspect } from "../app/api/inspect/route.ts";
import { POST as prepare } from "../app/api/execute/prepare/route.ts";
import { GET as caps } from "../app/api/capabilities/route.ts";
import { setPoolForTests } from "../lib/db";
import { hashSessionToken } from "../lib/wallet-auth";

const BASE = "http://localhost:3000";
let n = 0;

// IP unik per tes agar rate limiter tidak saling mengganggu.
const ip = () => `10.0.${Math.floor(++n / 250)}.${n % 250}`;

const post = (
  path: string,
  body: unknown,
  over: Record<string, string> = {},
  raw?: string
) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: {
      origin: BASE,
      "content-type": "application/json",
      "x-forwarded-for": ip(),
      ...over,
    },
    body: raw ?? JSON.stringify(body),
  });

const j = async (r: Response) => (await r.json()) as any;
const EXECUTION_TOKEN_A = "A".repeat(43);
const EXECUTION_TOKEN_B = "B".repeat(43);

const EXECUTION_USER_A = "11111111-1111-4111-8111-111111111111";
const EXECUTION_USER_B = "22222222-2222-4222-8222-222222222222";

const EXECUTION_KEY = "33333333-3333-4333-8333-333333333333";

const executionIntent = {
  kind: "swap",
  chainId: 4663,
  tokenIn: "USDG",
  tokenOut: "ETH",
  amountIn: "1",
  privateRequested: false,
};

type ExecutionRow = {
  user_id: string;
  request_hash: string;
  response: {
    status: number;
    body: Record<string, string>;
  } | null;
};

function installExecutionDb(options: { failAudit?: boolean } = {}) {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_URL = "postgres://vetto-test.invalid/test";

  const rows = new Map<string, ExecutionRow>();
  const auditEvents: unknown[][] = [];

  const users = new Map([
    [hashSessionToken(EXECUTION_TOKEN_A), EXECUTION_USER_A],
    [hashSessionToken(EXECUTION_TOKEN_B), EXECUTION_USER_B],
  ]);

  const pool = {
    query: async (sql: string, values: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

      if (normalized.startsWith("select user_id from user_sessions")) {
        const userId = users.get(String(values[0]));

        return {
          rows: userId ? [{ user_id: userId }] : [],
          rowCount: userId ? 1 : 0,
        };
      }

      throw new Error(`Unexpected pool SQL: ${normalized}`);
    },

    connect: async () => {
      let snapshot: Map<string, ExecutionRow> | undefined;

      const client = {
        query: async (sql: string, values: readonly unknown[] = []) => {
          const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

          if (normalized === "begin") {
            snapshot = new Map(
              [...rows.entries()].map(([key, value]) => [
                key,
                structuredClone(value),
              ]),
            );

            return { rows: [], rowCount: 0 };
          }

          if (normalized === "commit") {
            snapshot = undefined;
            return { rows: [], rowCount: 0 };
          }

          if (normalized === "rollback") {
            if (snapshot) {
              rows.clear();

              for (const [key, value] of snapshot) {
                rows.set(key, structuredClone(value));
              }
            }

            snapshot = undefined;
            return { rows: [], rowCount: 0 };
          }

          if (normalized.startsWith("delete from idempotency_keys")) {
            return { rows: [], rowCount: 0 };
          }

          if (normalized.startsWith("insert into idempotency_keys")) {
            const [key, userId, requestHash] = values.map(String);

            if (!rows.has(key!)) {
              rows.set(key!, {
                user_id: userId!,
                request_hash: requestHash!,
                response: null,
              });
            }

            return { rows: [], rowCount: 1 };
          }

          if (normalized.startsWith("select user_id, request_hash, response")) {
            const row = rows.get(String(values[0]));

            return {
              rows: row ? [structuredClone(row)] : [],
              rowCount: row ? 1 : 0,
            };
          }

          if (normalized.startsWith("insert into audit_log")) {
            if (options.failAudit) {
              throw new Error("Simulated audit database failure.");
            }

            auditEvents.push([...values]);

            return { rows: [], rowCount: 1 };
          }

          if (normalized.startsWith("update idempotency_keys set response")) {
            const row = rows.get(String(values[0]));

            if (row) {
              row.response = JSON.parse(String(values[1]));
            }

            return { rows: [], rowCount: row ? 1 : 0 };
          }

          throw new Error(`Unexpected client SQL: ${normalized}`);
        },

        release() {},
      };

      return client;
    },
  };

  setPoolForTests(pool as never);

  return {
    rows,
    auditEvents,
    cleanup() {
      setPoolForTests(undefined);

      if (previousDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousDatabaseUrl;
      }
    },
  };
}

function authenticatedPrepareRequest(
  token = EXECUTION_TOKEN_A,
  intentBody: unknown = executionIntent,
  key = EXECUTION_KEY,
) {
  return new Request(`${BASE}/api/execute/prepare`, {
    method: "POST",
    headers: {
      origin: BASE,
      "content-type": "application/json",
      "x-forwarded-for": ip(),
      "idempotency-key": key,
      cookie: `vetto_session=${token}`,
    },
    body: JSON.stringify({ intent: intentBody }),
  });
}

test("POST /api/intent: swap → typed intent + interpretation line", async () => {
  const r = await intent(
    post("/api/intent", { text: "swap 10 USDG to ETH" })
  );

  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");

  const b = await j(r);

  assert.deepEqual(b.intent, {
    kind: "swap",
    chainId: 4663,
    tokenIn: "USDG",
    tokenOut: "ETH",
    amountIn: "10",
    privateRequested: false,
  });

  assert.match(b.label, /Robinhood Chain/);
});

test("POST /api/intent parses a common Indonesian swap phrase without calling the LLM", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error(
      "LLM must not be called for a supported deterministic phrase"
    );
  };

  try {
    const response = await intent(
      post("/api/intent", {
        text: "Tolong ubahkan 0.1 ETH saya jadi USDG",
      })
    );

    const body = await j(response);

    assert.equal(response.status, 200);
    assert.equal(body.intent.kind, "swap");
    assert.equal(body.intent.amountIn, "0.1");
    assert.equal(body.intent.tokenIn, "ETH");
    assert.equal(body.intent.tokenOut, "USDG");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/intent: ambiguous → clarification, never guesses a token", async () => {
  const b = await j(
    await intent(post("/api/intent", { text: "swap 500 USDG" }))
  );

  assert.equal(b.intent.kind, "clarification");
  assert.deepEqual(b.intent.choices, ["swap 500 USDG to ETH"]);
});

test("follow-up uses context.lastUrl", async () => {
  const b = await j(
    await intent(
      post("/api/intent", {
        text: "open it live",
        context: { lastUrl: "https://demo-dex.app/" },
      })
    )
  );

  assert.deepEqual(b.intent, {
    kind: "live-browser",
    action: "start",
    url: "https://demo-dex.app/",
  });
});

test("follow-up uses validated pending swap and last-pair context", async () => {
  const pending = await j(
    await intent(
      post("/api/intent", {
        text: "ETH",
        context: {
          pendingIntent: {
            kind: "swap",
            tokenIn: "USDG",
            amountIn: "2",
            privateRequested: false,
          },
        },
      })
    )
  );

  assert.deepEqual(pending.intent, {
    kind: "swap",
    chainId: 4663,
    tokenIn: "USDG",
    tokenOut: "ETH",
    amountIn: "2",
    privateRequested: false,
  });

  const pair = await j(
    await intent(
      post("/api/intent", {
        text: "swap 3 USDG",
        context: {
          lastPair: {
            tokenIn: "USDG",
            tokenOut: "ETH",
          },
        },
      })
    )
  );

  assert.equal(pair.intent.kind, "swap");
  assert.equal(pair.intent.tokenOut, "ETH");

  const invalid = await j(
    await intent(
      post("/api/intent", {
        text: "ETH",
        context: {
          pendingIntent: {
            kind: "swap",
            tokenIn: "USDG",
            amountIn: "1.123456789",
            privateRequested: false,
          },
        },
      })
    )
  );

  assert.equal(invalid.intent.kind, "chat");
});

test("POST /api/intent prevents LLM from inventing swap parameters", async () => {
  const previous = {
    key: process.env.LLM_API_KEY,
    url: process.env.LLM_API_URL,
    model: process.env.LLM_MODEL,
  };

  const originalFetch = globalThis.fetch;

  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_API_URL =
    "https://llm.example/v1/chat/completions";
  process.env.LLM_MODEL = "test-model";

  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              kind: "swap",
              chainId: 4663,
              tokenIn: "ETH",
              tokenOut: "USDG",
              amountIn: "0.5",
              privateRequested: false,
            }),
          },
        },
      ],
    });

  try {
    const response = await intent(
      post("/api/intent", {
        text: "ubah eth saya ke USDG",
        context: {
          lastUrl: "https://previous-site.example/",
        },
      })
    );

    const body = await j(response);

    assert.equal(response.status, 200);
    assert.equal(body.intent.kind, "clarification");

    assert.match(
      body.intent.question,
      /specify the amount and token pair explicitly/i
    );
  } finally {
    globalThis.fetch = originalFetch;

    if (previous.key === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous.key;

    if (previous.url === undefined) delete process.env.LLM_API_URL;
    else process.env.LLM_API_URL = previous.url;

    if (previous.model === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = previous.model;
  }
});

test("POST /api/intent reports a safe warning when the provider rejects the request", async () => {
  const previous = {
    key: process.env.LLM_API_KEY,
    url: process.env.LLM_API_URL,
    model: process.env.LLM_MODEL,
  };

  const originalFetch = globalThis.fetch;

  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_API_URL =
    "https://llm.example/v1/chat/completions";
  process.env.LLM_MODEL = "invalid-model";

  const providerMessage = "Requested entity was not found.";
  const originalWarn = console.warn;
  const warnings: string[] = [];

  console.warn = (...args: unknown[]) =>
    warnings.push(args.join(" "));

  globalThis.fetch = async () =>
    Response.json(
      { error: { message: providerMessage } },
      { status: 400 }
    );

  try {
    const body = await j(
      await intent(
        post("/api/intent", {
          text: "ubah eth saya ke USDG",
        })
      )
    );

    assert.equal(body.intent.kind, "chat");
    assert.match(body.warning, /HTTP 400.*LLM_MODEL/);
    assert.doesNotMatch(
      body.warning,
      /Requested entity|test-key|invalid-model/
    );

    assert.ok(
      warnings.some((warning) =>
        warning.includes(`HTTP 400: ${providerMessage}`)
      )
    );

    assert.ok(
      warnings.every((warning) => !warning.includes("test-key"))
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;

    if (previous.key === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous.key;

    if (previous.url === undefined) delete process.env.LLM_API_URL;
    else process.env.LLM_API_URL = previous.url;

    if (previous.model === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = previous.model;
  }
});

test("guard: cross-origin, missing origin, non-JSON, bad JSON, oversize, wrong shape", async () => {
  assert.equal(
    (
      await intent(
        post(
          "/api/intent",
          { text: "x" },
          { origin: "https://evil.example" }
        )
      )
    ).status,
    403
  );

  const noOrigin = new Request(`${BASE}/api/intent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  });

  assert.equal((await intent(noOrigin)).status, 403);

  assert.equal(
    (
      await intent(
        post(
          "/api/intent",
          {},
          { "content-type": "text/plain" }
        )
      )
    ).status,
    415
  );

  assert.equal(
    (await intent(post("/api/intent", null, {}, "{oops"))).status,
    400
  );

  assert.equal(
    (
      await intent(
        post("/api/intent", { text: "a".repeat(5000) })
      )
    ).status,
    413
  );

  assert.equal(
    (await intent(post("/api/intent", { text: 123 }))).status,
    400
  );
});

test("rate limit: 31st request from one IP → 429 + Retry-After; other IPs unaffected", async () => {
  const same = {
    "x-forwarded-for": "198.51.100.9",
  };

  let last: Response | undefined;

  for (let i = 0; i < 31; i++) {
    last = await intent(
      post("/api/intent", { text: "hi" }, same)
    );
  }

  assert.equal(last!.status, 429);
  assert.ok(Number(last!.headers.get("retry-after")) >= 1);

  assert.equal(
    (await intent(post("/api/intent", { text: "hi" }))).status,
    200
  );
});

test("POST /api/quotes: no executable quote → empty routes + honest message", async () => {
  const { intent: it } = await j(
    await intent(
      post("/api/intent", {
        text: "swap 10 USDG to ETH",
      })
    )
  );

  const r = await quotes(
    post("/api/quotes", { intent: it })
  );

  assert.equal(r.status, 200);

  const b = await j(r);

  assert.deepEqual(b.routes, []);
  assert.ok(typeof b.message === "string");
  assert.match(b.message, /quote|route|available/i);
});

test("POST /api/quotes: wrong chain, non-swap, raw address from an LLM, unknown token are rejected", async () => {
  const swap = (o: object) => ({
    intent: {
      kind: "swap",
      chainId: 4663,
      tokenIn: "USDG",
      tokenOut: "ETH",
      amountIn: "1",
      privateRequested: false,
      ...o,
    },
  });

  assert.equal(
    (
      await quotes(
        post("/api/quotes", {
          intent: { kind: "chat", text: "hi" },
        })
      )
    ).status,
    400
  );

  assert.equal(
    (
      await quotes(
        post("/api/quotes", swap({ chainId: 1 }))
      )
    ).status,
    400
  );

  assert.equal(
    (
      await quotes(
        post(
          "/api/quotes",
          swap({
            tokenOut:
              "0xdeadbeef00000000000000000000000000000000",
          })
        )
      )
    ).status,
    400
  );

  // Unknown registry symbols are rejected by validateIntent before quote lookup.
  assert.equal(
    (
      await quotes(
        post("/api/quotes", swap({ tokenOut: "PEPE" }))
      )
    ).status,
    400
  );
});

test("POST /api/execute/prepare: requires a valid idempotency key and authenticated session", async () => {
  const swapIntent = {
    kind: "swap",
    chainId: 4663,
    tokenIn: "USDG",
    tokenOut: "ETH",
    amountIn: "1",
    privateRequested: false,
  };

  const key = "00000000-0000-4000-8000-000000000001";

  assert.equal(
    (
      await prepare(
        post("/api/execute/prepare", {
          intent: swapIntent,
        })
      )
    ).status,
    400
  );

  const response = await prepare(
    post(
      "/api/execute/prepare",
      { intent: swapIntent },
      { "idempotency-key": key }
    )
  );

  assert.equal(response.status, 401);

  assert.deepEqual(await j(response), {
    error: "Sign in before preparing a transaction.",
  });
});

test("POST /api/inspect: rejects SSRF targets and reports possible brand lookalikes cautiously", async () => {
  for (const u of [
    "https://169.254.169.254/latest",
    "https://localhost/",
    "https://2130706433/",
    "http://example.com",
  ]) {
    const b = await j(
      await inspect(post("/api/inspect", { url: u }))
    );

    assert.equal(b.host, null, u);
    assert.equal(b.report.band, "dangerous", u);
  }

  const ok = await j(
    await inspect(
      post("/api/inspect", {
        url: "https://demo-dex.app/swap",
      })
    )
  );

  assert.equal(ok.host, "demo-dex.app");
  assert.equal(ok.report.band, "insufficient evidence");
  assert.ok(ok.report.checksUnavailable.length > 0);

  const lookalike = await j(
    await inspect(
      post("/api/inspect", {
        url: "https://r0binhood-login.example",
      })
    )
  );

  assert.equal(lookalike.host, "r0binhood-login.example");
  assert.equal(lookalike.report.band, "insufficient evidence");
  assert.equal(
    lookalike.report.findings[0].title,
    "Possible brand lookalike"
  );
  assert.match(
    lookalike.report.findings[0].uncertainty,
    /heuristic only/
  );
});

test("GET /api/capabilities: external capabilities are not falsely verified", async () => {
  const b = await j(await caps());

  assert.equal(b.chainId, 4663);

  const ext = b.capabilities.filter((c: any) =>
    /^(route-|transaction-|private-|wallet-|dapp-|agent-|live-)/.test(c.id)
  );

  assert.ok(
    ext.length > 0 && ext.every((c: any) => c.status !== "verified")
  );

  assert.ok(
    b.assets.every((a: any) =>
      ["verified", "unverified"].includes(a.status)
    )
  );

  assert.ok(b.assets.some((a: any) => a.symbol === "ETH"));
  assert.ok(b.assets.some((a: any) => a.symbol === "USDG"));
});

test("execute prepare: same key and intent returns the stored response without duplicate audit", async () => {
  const db = installExecutionDb();

  try {
    const first = await prepare(authenticatedPrepareRequest());
    const firstBody = await j(first);

    assert.equal(first.status, 503);
    assert.equal(firstBody.code, "EXECUTION_DISABLED");

    const second = await prepare(authenticatedPrepareRequest());
    const secondBody = await j(second);

    assert.equal(second.status, 503);
    assert.deepEqual(secondBody, firstBody);

    assert.equal(db.rows.size, 1);
    assert.equal(db.auditEvents.length, 1);
  } finally {
    db.cleanup();
  }
});

test("execute prepare: same key with a different intent returns 409", async () => {
  const db = installExecutionDb();

  try {
    const first = await prepare(authenticatedPrepareRequest());

    assert.equal(first.status, 503);

    const changedIntent = {
      ...executionIntent,
      amountIn: "2",
    };

    const second = await prepare(
      authenticatedPrepareRequest(
        EXECUTION_TOKEN_A,
        changedIntent,
      ),
    );

    assert.equal(second.status, 409);
    assert.equal(db.auditEvents.length, 1);
  } finally {
    db.cleanup();
  }
});

test("execute prepare: same key used by another user returns 409", async () => {
  const db = installExecutionDb();

  try {
    const first = await prepare(authenticatedPrepareRequest());

    assert.equal(first.status, 503);

    const second = await prepare(
      authenticatedPrepareRequest(EXECUTION_TOKEN_B),
    );

    assert.equal(second.status, 409);
    assert.equal(db.auditEvents.length, 1);
  } finally {
    db.cleanup();
  }
});

test("execute prepare: audit failure rolls back the idempotency record", async () => {
  const db = installExecutionDb({ failAudit: true });

  try {
    const response = await prepare(authenticatedPrepareRequest());
    const body = await j(response);

    assert.equal(response.status, 503);

    assert.match(
      body.error,
      /no payload was created/i,
    );

    assert.equal(db.rows.size, 0);
    assert.equal(db.auditEvents.length, 0);
  } finally {
    db.cleanup();
  }
});