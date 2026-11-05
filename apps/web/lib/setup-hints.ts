/**
 * Turns a failed database/limiter call into an actionable hint.
 *
 * A 503 that only says "temporarily unavailable" is a dead end: in practice the cause is
 * almost always setup (no RATE_LIMIT_SALT, no migrations, DATABASE_URL pointing somewhere
 * that is not listening). We classify the error and return a stable code plus a hint the
 * operator can act on. The raw driver message is never returned to the client — it can
 * contain host names and user names; it is only logged server-side.
 */

export type SetupHint = { code: string; hint: string };

interface ClassifiedError {
  code?: unknown;
  message?: unknown;
}

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as ClassifiedError).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = (error as ClassifiedError).message;
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}

export function setupHint(error: unknown): SetupHint | undefined {
  const message = messageOf(error);

  if (message.includes("RATE_LIMIT_SALT")) {
    return {
      code: "RATE_LIMIT_SALT_MISSING",
      hint:
        "Set RATE_LIMIT_SALT to at least 32 random characters in apps/web/.env.local " +
        "(openssl rand -hex 32) and restart the server.",
    };
  }

  const code = postgresCode(error);

  // undefined_table: connected fine, schema was never applied.
  if (code === "42P01" || message.includes("does not exist") && message.includes("relation")) {
    return {
      code: "SCHEMA_MISSING",
      hint: "The database is reachable but has no VETTO tables yet: run `pnpm db:migrate`, then retry.",
    };
  }

  // invalid_catalog_name: the database named in DATABASE_URL is not there.
  if (code === "3D000") {
    return {
      code: "DATABASE_MISSING",
      hint: "DATABASE_URL names a database that does not exist. Create it, then run `pnpm db:migrate`.",
    };
  }

  // Authentication / connectivity failures.
  if (code === "28P01" || code === "28000" || code === "42501") {
    return {
      code: "DATABASE_REJECTED",
      hint: "The database refused the credentials in DATABASE_URL. Check the user, password and any ?sslmode= requirement.",
    };
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND")
  ) {
    return {
      code: "DATABASE_UNREACHABLE",
      hint: "Nothing is listening at DATABASE_URL. Start Postgres (or fix the host/port), then retry.",
    };
  }

  return undefined;
}

/** Extra JSON fields to attach to a 503 so the client can explain what to fix. */
export function failureFields(error: unknown): Record<string, string> {
  const classified = setupHint(error);
  return classified ? { code: classified.code, hint: classified.hint } : {};
}
