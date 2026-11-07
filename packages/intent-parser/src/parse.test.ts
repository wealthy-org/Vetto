
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIntent,
  parseDecimal,
  formatUnits,
  validateIntent,
  IntentValidationError,
  parseIntentWithLlm,
} from "./index.ts";

test("swap: exact assets, chain, amount shown before quoting", () => {
  const r = parseIntent("swap 10 USDG to ETH");
  assert.deepEqual(r.intent, {
    kind: "swap",
    chainId: 4663,
    tokenIn: "USDG",
    tokenOut: "ETH",
    amountIn: "10",
    privateRequested: false,
  });
  assert.match(
    r.label,
    /Swap 10 USDG → ETH · Robinhood Chain · public submission/,
  );
});

test("Indonesian swap request is parsed deterministically without an LLM", () => {
  const parsed = parseIntent("Tolong ubahkan 0.1 ETH saya jadi USDG");
  assert.deepEqual(parsed.intent, {
    kind: "swap",
    chainId: 4663,
    tokenIn: "ETH",
    tokenOut: "USDG",
    amountIn: "0.1",
    privateRequested: false,
  });
});

test("swap: thousands separators, private flag, slippage in bps", () => {
  const r = parseIntent("Swap 10,000 usdg to eth privately with 1% slippage");
  assert.equal(r.intent.kind, "swap");

  if (r.intent.kind === "swap") {
    assert.equal(r.intent.amountIn, "10000");
    assert.equal(r.intent.privateRequested, true);
    assert.equal(r.intent.slippageBps, 100);
  }
});

test("missing destination asks instead of guessing", () => {
  const r = parseIntent("swap 500 USDG");
  assert.equal(r.intent.kind, "clarification");

  if (r.intent.kind === "clarification") {
    assert.deepEqual(r.intent.choices, ["swap 500 USDG to ETH"]);
  }
});

test("unknown token is never guessed", () => {
  const r = parseIntent("swap 5 PEPE to ETH");
  assert.equal(r.intent.kind, "clarification");
});

test("same-token, zero, over-precision and excessive slippage are rejected", () => {
  const inputs = [
    "swap 5 ETH to ETH",
    "swap 0 ETH to USDG",
    "swap 1.1234567 USDG to ETH",
    "swap 1 ETH to USDG 50% slippage",
  ];

  for (const input of inputs) {
    assert.equal(parseIntent(input).intent.kind, "clarification", input);
  }
});

test("ambiguous number formats are rejected", () => {
  assert.equal(
    parseIntent("swap 1,5 ETH to USDG").intent.kind,
    "clarification",
  );
});

test("inspect: keywords inside hostnames do not trigger agent tasks", () => {
  const r = parseIntent("Is claim-hood-rewards.xyz safe?");
  assert.equal(r.intent.kind, "inspect");
});

test("bare link is inspected", () => {
  assert.equal(
    parseIntent("https://example-dex.app/swap").intent.kind,
    "inspect",
  );
});

test("agent task needs an explicit spend cap", () => {
  assert.equal(
    parseIntent("Mint the NFT at nft-mint-pass.app").intent.kind,
    "clarification",
  );

  const r = parseIntent("Mint the NFT at nft-mint-pass.app max 0.01 ETH");
  assert.equal(r.intent.kind, "agent-task");

  if (r.intent.kind === "agent-task") {
    assert.equal(r.intent.maxSpend, "0.01 ETH");
  }
});

test("follow-ups use remembered url", () => {
  const r = parseIntent("open it live", {
    lastUrl: "https://example-dex.app/",
  });

  assert.deepEqual(r.intent, {
    kind: "live-browser",
    action: "start",
    url: "https://example-dex.app/",
  });
});

test("pending swap asks for a destination and resolves a token-only follow-up", () => {
  const first = parseIntent("swap 2 USDG privately with 0.5% slippage");

  assert.equal(first.intent.kind, "clarification");
  assert.deepEqual(first.pendingIntent, {
    kind: "swap",
    tokenIn: "USDG",
    amountIn: "2",
    privateRequested: true,
    slippageBps: 50,
  });

  const followUp = parseIntent("ETH", {
    pendingIntent: first.pendingIntent,
  });

  assert.deepEqual(followUp.intent, {
    kind: "swap",
    chainId: 4663,
    tokenIn: "USDG",
    tokenOut: "ETH",
    amountIn: "2",
    privateRequested: true,
    slippageBps: 50,
  });

  assert.equal(
    parseIntent("ETH", {
      lastUrl: "https://previous-site.example/",
      pendingIntent: first.pendingIntent,
    }).intent.kind,
    "swap",
  );
});

test("last pair supplies only the previously selected destination", () => {
  const r = parseIntent("swap 3 USDG", {
    lastPair: { tokenIn: "USDG", tokenOut: "ETH" },
  });

  assert.equal(r.intent.kind, "swap");

  if (r.intent.kind === "swap") {
    assert.equal(r.intent.tokenOut, "ETH");
  }

  assert.equal(
    parseIntent("swap 3 USDG", {
      lastPair: { tokenIn: "ETH", tokenOut: "USDG" },
    }).intent.kind,
    "clarification",
  );
});

test("decimal math is exact (no floats)", () => {
  assert.equal(parseDecimal("0.1", 18), 100000000000000000n);
  assert.equal(parseDecimal("123456789.123456", 6), 123456789123456n);
  assert.equal(formatUnits(2922900000000000000n, 18), "2.9229");
  assert.equal(formatUnits(5n, 6), "0.000005");
});

test("validateIntent only accepts HTTP and HTTPS URLs", () => {
  assert.throws(
    () => validateIntent({
      kind: "inspect",
      url: "javascript:alert(1)",
    }),
    IntentValidationError,
  );

  assert.throws(
    () => validateIntent({
      kind: "inspect",
      url: "file:///etc/passwd",
    }),
    IntentValidationError,
  );

  assert.equal(
    validateIntent({
      kind: "inspect",
      url: "https://example.com",
    }).kind,
    "inspect",
  );
});

test("LLM output cannot authorize an unknown token swap", async () => {
  const llm = async () => ({
    kind: "swap",
    chainId: 4663,
    tokenIn: "ETH",
    tokenOut: "SCAMCOIN",
    amountIn: "1",
    privateRequested: false,
  });

  const r = await parseIntentWithLlm(
    "could you possibly turn my eth into something fun",
    {},
    llm,
  );

  assert.equal(r.intent.kind, "clarification");
});

test("LLM cannot invent swap parameters", async () => {
  const parsed = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => ({
      kind: "swap",
      chainId: 4663,
      tokenIn: "ETH",
      tokenOut: "USDG",
      amountIn: "0.5",
      privateRequested: false,
    }),
  );

  assert.equal(parsed.intent.kind, "clarification");

  if (parsed.intent.kind === "clarification") {
    assert.match(
      parsed.intent.question,
      /specify the amount and token pair explicitly/i,
    );
  }
});

test("LLM clarification remains supported", async () => {
  const ambiguous = await parseIntentWithLlm(
    "ubah eth saya ke dolar",
    {},
    async () => ({
      kind: "clarification",
      question: "Token dolar yang mana?",
    }),
  );

  assert.deepEqual(ambiguous.intent, {
    kind: "clarification",
    question: "Token dolar yang mana?",
  });
});

test("LLM cannot invent private submission or slippage", async () => {
  const parsed = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => ({
      kind: "swap",
      chainId: 4663,
      tokenIn: "ETH",
      tokenOut: "USDG",
      amountIn: "1",
      privateRequested: true,
      slippageBps: 500,
    }),
  );

  assert.equal(parsed.intent.kind, "clarification");
});

test("LLM errors are visible as a safe fallback warning", async () => {
  const parsed = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => {
      throw new Error("provider response contains secret details");
    },
  );

  assert.equal(parsed.intent.kind, "chat");
  assert.equal(parsed.warningCode, "llm-invalid");
  assert.match(parsed.warning ?? "", /swaps and link checks still work/i);
  assert.match(parsed.warning ?? "", /Nothing was executed\./);
  // Provider internals stay in the server log, never in the chat bubble.
  assert.doesNotMatch(parsed.warning ?? "", /secret details|LLM_API_KEY|HTTP \d{3}/);
});

test("provider HTTP errors produce actionable safe guidance", async () => {
  const throttled = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => {
      throw new Error("LLM_PROVIDER_HTTP_429");
    },
  );

  assert.equal(throttled.warningCode, "llm-quota");
  assert.match(throttled.warning ?? "", /rate-limited/i);
  assert.doesNotMatch(throttled.warning ?? "", /HTTP 429/);

  const missingModel = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => {
      throw new Error("LLM_PROVIDER_HTTP_404");
    },
  );

  assert.equal(missingModel.warningCode, "llm-model");
  assert.match(missingModel.warning ?? "", /Free-form parsing is off/i);
});

test("a rejected API key reads as a deployment limit, not a crash", async () => {
  const rejected = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => {
      throw new Error("LLM_PROVIDER_HTTP_401");
    },
  );

  assert.equal(rejected.intent.kind, "chat");
  assert.equal(rejected.warningCode, "llm-auth");
  assert.match(rejected.warning ?? "", /Free-form parsing is off on this deployment/);
  assert.match(rejected.warning ?? "", /swap 0\.1 ETH to USDG/);
  assert.match(rejected.warning ?? "", /Nothing was executed\./);
});

test("LLM timeouts explain the delay and safe retry", async () => {
  const parsed = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {},
    async () => {
      throw new Error("LLM_PROVIDER_TIMEOUT");
    },
  );

  assert.equal(parsed.intent.kind, "clarification");

  if (parsed.intent.kind === "clarification") {
    assert.match(
      parsed.intent.question,
      /specify the amount and token pair explicitly/i,
    );
  }
});

test("remembered URLs do not allow LLM to authorize an unverified swap", async () => {
  let called = false;

  const parsed = await parseIntentWithLlm(
    "ubah eth saya ke USDG",
    {
      lastUrl: "https://previous-site.example/",
    },
    async () => {
      called = true;

      return {
        kind: "swap",
        chainId: 4663,
        tokenIn: "ETH",
        tokenOut: "USDG",
        amountIn: "1",
        privateRequested: false,
      };
    },
  );

  assert.equal(called, true);
  assert.equal(parsed.intent.kind, "clarification");
});

test("an unknown symbol names what this deployment does have, instead of a dead end", () => {
  const parsed = parseIntent("swap 1 ETH to NOTACOIN");
  assert.equal(parsed.intent.kind, "clarification");
  const question = parsed.intent.kind === "clarification" ? parsed.intent.question : "";
  // Still refuses to guess a contract…
  assert.match(question, /won't guess a contract/);
  // …but the person is told which symbols the registry holds, so the next message can succeed.
  assert.match(question, /This deployment knows: .*ETH/);
  assert.match(question, /This deployment knows: .*USDG/);
});
