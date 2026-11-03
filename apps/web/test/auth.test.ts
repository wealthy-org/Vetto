import { test } from "node:test";
import assert from "node:assert/strict";

import { POST as challenge } from "../app/api/auth/challenge/route.ts";
import { POST as verify } from "../app/api/auth/verify/route.ts";
import { GET as session } from "../app/api/auth/session/route.ts";
import { POST as logout } from "../app/api/auth/logout/route.ts";
import {
  DELETE as deleteHistory,
  GET as history,
  POST as saveHistory,
} from "../app/api/history/route.ts";
import { GET as balances } from "../app/api/balances/route.ts";

import { setPoolForTests } from "../lib/db";
import { authenticatedUserId } from "../lib/authenticated-user";
import { hashSessionToken } from "../lib/wallet-auth";

const BASE = "http://localhost:3000";

let requestId = 0;

const headers = () => ({
  origin: BASE,
  "content-type": "application/json",
  "x-forwarded-for": `10.2.0.${++requestId}`,
});

const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

const remove = (body: unknown, over: Record<string, string> = {}) =>
  new Request(`${BASE}/api/history`, {
    method: "DELETE",
    headers: { ...headers(), ...over },
    body: JSON.stringify(body),
  });

// -----------------------------------------------------------------------------
// Mock PostgreSQL untuk pengujian session
// -----------------------------------------------------------------------------

type SessionDbState = {
  revoked: boolean;
  expired: boolean;
  failOnUpdate?: boolean;
  queries: Array<{
    sql: string;
    values: readonly unknown[];
  }>;
};

const TEST_TOKEN = "A".repeat(43);
const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ADDRESS = "0x0000000000000000000000000000000000000001";

function installSessionDb(state: SessionDbState) {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_URL = "postgres://vetto-test.invalid/test";

  const mockPool = {
    query: async (
      sql: string,
      values: readonly unknown[] = [],
    ) => {
      const normalized = sql
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      state.queries.push({
        sql: normalized,
        values,
      });

      const active = !state.revoked && !state.expired;

      if (normalized.startsWith("select w.address")) {
        return {
          rows: active
            ? [
                {
                  address: TEST_ADDRESS,
                  chain_id: "4663",
                },
              ]
            : [],
          rowCount: active ? 1 : 0,
        };
      }

      if (normalized.startsWith("select user_id")) {
        return {
          rows: active
            ? [{ user_id: TEST_USER_ID }]
            : [],
          rowCount: active ? 1 : 0,
        };
      }

      if (normalized.startsWith("update user_sessions")) {
        if (state.failOnUpdate) {
          throw new Error("Simulated database failure.");
        }

        state.revoked = true;

        return {
          rows: [],
          rowCount: 1,
        };
      }

      throw new Error(`Unexpected test SQL: ${normalized}`);
    },
  };

  setPoolForTests(mockPool as never);

  return () => {
    setPoolForTests(undefined);

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  };
}

function sessionRequest(token = TEST_TOKEN) {
  return new Request(`${BASE}/api/auth/session`, {
    headers: {
      cookie: `vetto_session=${token}`,
    },
  });
}

function logoutRequest(token = TEST_TOKEN) {
  return new Request(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      ...headers(),
      cookie: `vetto_session=${token}`,
    },
    body: JSON.stringify({}),
  });
}

// -----------------------------------------------------------------------------
// Wallet authentication validation
// -----------------------------------------------------------------------------

test("wallet challenge rejects malformed address before database access", async () => {
  const response = await challenge(
    post("/api/auth/challenge", {
      address: "not-an-address",
    }),
  );

  assert.equal(response.status, 400);
});

test("wallet challenge rejects unsupported chains before database access", async () => {
  const unsupported = await challenge(
    post("/api/auth/challenge", {
      address: "0x0000000000000000000000000000000000000001",
      chainId: 5,
    }),
  );

  assert.equal(unsupported.status, 400);
});

test("wallet verification rejects malformed challenge input before database access", async () => {
  const response = await verify(
    post("/api/auth/verify", {
      challengeId: "not-a-uuid",
      address: "not-an-address",
      signature: "0x1234",
    }),
  );

  assert.equal(response.status, 400);
});

// -----------------------------------------------------------------------------
// Session lifecycle
// -----------------------------------------------------------------------------

test("session status without a cookie is explicitly unauthenticated", async () => {
  const response = await session(
    new Request(`${BASE}/api/auth/session`),
  );

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    authenticated: false,
  });
});

test("session accepts an active database-backed wallet session", async () => {
  const state: SessionDbState = {
    revoked: false,
    expired: false,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    const response = await session(sessionRequest());

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      authenticated: true,
      wallet: {
        address: TEST_ADDRESS,
        chainId: 4663,
      },
    });

    assert.equal(state.queries.length, 1);

    assert.equal(
      state.queries[0]?.values[0],
      hashSessionToken(TEST_TOKEN),
    );
  } finally {
    cleanup();
  }
});

test("session rejects an expired session and clears its cookie", async () => {
  const state: SessionDbState = {
    revoked: false,
    expired: true,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    const response = await session(sessionRequest());

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      authenticated: false,
    });

    assert.match(
      response.headers.get("set-cookie") ?? "",
      /Max-Age=0/,
    );
  } finally {
    cleanup();
  }
});

test("session rejects a revoked session and clears its cookie", async () => {
  const state: SessionDbState = {
    revoked: true,
    expired: false,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    const response = await session(sessionRequest());

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      authenticated: false,
    });

    assert.match(
      response.headers.get("set-cookie") ?? "",
      /Max-Age=0/,
    );
  } finally {
    cleanup();
  }
});

// -----------------------------------------------------------------------------
// Logout
// -----------------------------------------------------------------------------

test("sign-out without a session clears the cookie and remains idempotent", async () => {
  const response = await logout(
    post("/api/auth/logout", {}),
  );

  assert.equal(response.status, 200);

  assert.deepEqual(await response.json(), {
    authenticated: false,
  });

  assert.match(
    response.headers.get("set-cookie") ?? "",
    /Max-Age=0/,
  );
});

test("logout revokes the database session before clearing the cookie", async () => {
  const state: SessionDbState = {
    revoked: false,
    expired: false,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    const response = await logout(logoutRequest());

    assert.equal(response.status, 200);

    assert.deepEqual(await response.json(), {
      authenticated: false,
    });

    assert.match(
      response.headers.get("set-cookie") ?? "",
      /Max-Age=0/,
    );

    assert.equal(state.revoked, true);

    const update = state.queries.find((query) =>
      query.sql.startsWith("update user_sessions"),
    );

    assert.ok(update);

    assert.equal(
      update.values[0],
      hashSessionToken(TEST_TOKEN),
    );

    const subsequentSession = await session(sessionRequest());

    assert.equal(subsequentSession.status, 200);

    assert.deepEqual(await subsequentSession.json(), {
      authenticated: false,
    });
  } finally {
    cleanup();
  }
});

test("logout fails closed when database revocation fails", async () => {
  const state: SessionDbState = {
    revoked: false,
    expired: false,
    failOnUpdate: true,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    const response = await logout(logoutRequest());

    assert.equal(response.status, 503);

    assert.equal(
      response.headers.get("set-cookie"),
      null,
    );

    assert.equal(state.revoked, false);
  } finally {
    cleanup();
  }
});

// -----------------------------------------------------------------------------
// Authenticated user
// -----------------------------------------------------------------------------

test("authenticatedUserId accepts only an active session", async () => {
  const state: SessionDbState = {
    revoked: false,
    expired: false,
    queries: [],
  };

  const cleanup = installSessionDb(state);

  try {
    assert.equal(
      await authenticatedUserId(sessionRequest()),
      TEST_USER_ID,
    );

    state.revoked = true;

    assert.equal(
      await authenticatedUserId(sessionRequest()),
      null,
    );

    state.revoked = false;
    state.expired = true;

    assert.equal(
      await authenticatedUserId(sessionRequest()),
      null,
    );
  } finally {
    cleanup();
  }
});

// -----------------------------------------------------------------------------
// Private endpoints
// -----------------------------------------------------------------------------

test("wallet balances are private and require a valid session", async () => {
  const response = await balances(
    new Request(`${BASE}/api/balances`),
  );

  assert.equal(response.status, 401);
});

test("saved history is private and requires a valid session", async () => {
  const response = await history(
    new Request(`${BASE}/api/history`),
  );

  assert.equal(response.status, 401);
});

test("deleting saved history requires a same-origin request and valid input", async () => {
  assert.equal(
    (await deleteHistory(remove({ id: "not-an-id" }))).status,
    400,
  );

  assert.equal(
    (await deleteHistory(remove({}))).status,
    400,
  );

  assert.equal(
    (
      await deleteHistory(
        remove({
          id: "11111111-1111-4111-8111-111111111111",
          clearAll: true,
        }),
      )
    ).status,
    400,
  );

  assert.equal(
    (
      await deleteHistory(
        remove(
          { clearAll: true },
          { origin: "https://evil.example" },
        ),
      )
    ).status,
    403,
  );

  assert.equal(
    (
      await deleteHistory(
        remove(
          { clearAll: true },
          { "content-type": "text/plain" },
        ),
      )
    ).status,
    415,
  );
});

test("deleting an item or all saved history requires an authenticated session", async () => {
  assert.equal(
    (
      await deleteHistory(
        remove({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      )
    ).status,
    401,
  );

  assert.equal(
    (
      await deleteHistory(
        remove({ clearAll: true }),
      )
    ).status,
    401,
  );
});

test("saving history requires an idempotency key and an authenticated session", async () => {
  const response = await saveHistory(
    new Request(`${BASE}/api/history`, {
      method: "POST",
      headers: {
        ...headers(),
        "idempotency-key": "11111111-1111-4111-8111-111111111111",
      },
      body: JSON.stringify({
        prompt: "Swap 1 ETH to USDG",
      }),
    }),
  );

  assert.equal(response.status, 401);
});

test("saving history rejects empty, oversized, or non-text prompts", async () => {
  const invalid = (prompt: unknown) =>
    saveHistory(
      new Request(`${BASE}/api/history`, {
        method: "POST",
        headers: {
          ...headers(),
          "idempotency-key": "11111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({ prompt }),
      }),
    );

  assert.equal(
    (await invalid("  ")).status,
    400,
  );

  assert.equal(
    (await invalid("x".repeat(501))).status,
    400,
  );

  assert.equal(
    (await invalid(42)).status,
    400,
  );
});