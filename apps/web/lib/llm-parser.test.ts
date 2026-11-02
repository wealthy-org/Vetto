import { test } from "node:test";
import assert from "node:assert/strict";
import { createLlmParser } from "./llm-parser.ts";

test("uses a bounded OpenAI-compatible request and returns structured content", async () => {
  let requestUrl = "";
  let requestHeaders: Headers | undefined;
  let requestBody: Record<string, unknown> | undefined;
  const parser = createLlmParser("test-key", undefined, undefined, async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ kind: "clarification", question: "Which token?" }) } }],
    });
  });

  const result = await parser("convert my ETH", {});
  assert.deepEqual(result, { kind: "clarification", question: "Which token?" });
  assert.equal(requestUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(requestHeaders?.get("authorization"), "Bearer test-key");
  assert.equal(requestBody?.temperature, 0);
  assert.equal(requestBody?.reasoning_effort, "low");
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
});

test("rejects insecure non-local LLM endpoints", () => {
  assert.throws(() => createLlmParser("test-key", "http://api.example.com/chat"), /must use HTTPS/);
});

test("rejects oversized provider response bodies", async () => {
  const parser = createLlmParser("test-key", undefined, undefined, async () =>
    new Response("x".repeat(16_385)),
  );
  await assert.rejects(parser("convert my ETH", {}), /too large/);
});

test("reports provider request timeouts without exposing request data", async () => {
  const parser = createLlmParser("test-key", undefined, undefined, async () => {
    const error = new Error("request aborted");
    error.name = "TimeoutError";
    throw error;
  });
  await assert.rejects(parser("convert my ETH", {}), /LLM_PROVIDER_TIMEOUT/);
});
