import assert from "node:assert/strict";
import { test } from "node:test";
import { createLlmParser, llmCooldownRemaining, resetLlmCooldown } from "./llm-parser.ts";

const KEY = "sk-test-not-a-real-key";
const ctx = {};

const reject = (status: number) =>
  (async () => new Response(JSON.stringify({ error: { message: "no" } }), { status })) as unknown as typeof fetch;

test("a 401 puts the parser on cooldown and stops calling the provider", async () => {
  resetLlmCooldown();
  let calls = 0;
  const parser = createLlmParser(KEY, "https://api.example.com/v1/chat", "m", (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 });
  }) as unknown as typeof fetch);

  await assert.rejects(parser("hello", ctx), /LLM_PROVIDER_HTTP_401/);
  assert.equal(calls, 1);
  assert.ok(llmCooldownRemaining() > 0);

  // Second message: no network call, immediate deterministic fallback signal.
  await assert.rejects(parser("hello again", ctx), /LLM_PROVIDER_DISABLED/);
  assert.equal(calls, 1, "the provider must not be hammered with a rejected key");

  resetLlmCooldown();
  assert.equal(llmCooldownRemaining(), 0);
});

test("a 403 also cools down; a 500 does not", async () => {
  resetLlmCooldown();
  const forbidden = createLlmParser(KEY, "https://api.example.com/v1/chat", "m", reject(403));
  await assert.rejects(forbidden("hi", ctx), /HTTP_403/);
  assert.ok(llmCooldownRemaining() > 0);

  resetLlmCooldown();
  const broken = createLlmParser(KEY, "https://api.example.com/v1/chat", "m", reject(500));
  await assert.rejects(broken("hi", ctx), /HTTP_500/);
  assert.equal(llmCooldownRemaining(), 0, "a transient 5xx must be retried next message");
});
