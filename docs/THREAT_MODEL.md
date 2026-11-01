# Threat model: status of required controls

| Control (brief §17) | State in this repo |
|---|---|
| LLM is not an execution authority | Done: `validateIntent` + registry resolution; LLM adapter is optional and swap-only |
| No float math on amounts | Done: bigint decimal util, tested |
| Unlimited / oversize approvals blocked | Done in `safety-policy` (policy only; no executor yet) |
| SSRF guard (private IPs, metadata, encoded IPs, DNS rebinding check) | Done: URL policy + `checkResolvedIps`. **Worker must resolve, pin IP, re-check each redirect** |
| Never show mock quotes as live | Done: `collectQuotes` only calls `verified` adapters; no adapters registered |
| Private never silently downgraded to public | Done, tested |
| CSP nonce, nosniff, frame deny, HSTS, COOP | Done: `middleware.ts`, `next.config.mjs` |
| Same-origin check, JSON-only, body limit, rate limit | Done: `lib/http.ts`. Rate limiter is in-memory; **swap for Postgres** before multi-instance |
| Idempotency, replay protection, audit log | Schema only (`db/migrations`); not wired |
| Wallet auth/session fixation | Implemented for EOA wallets: one-use, five-minute SIWE challenge on Ethereum Mainnet (chain ID 1) or Robinhood Chain (4663); server-side signature verification; opaque random session cookie with only its SHA-256 hash stored; explicit sign-out revocation. Only those chain IDs are accepted. This is message sign-in only and does not authorize or send a transaction. WalletConnect project ID and database/migration are required. Contract wallets, social login, and transaction authorization are not supported. |
| Quote revalidation, exact spender/permit scope, tx-diff detection | Not started (needs executor) |
| Sandbox isolation, burner signer, teardown proof | Not started (Phase 3) |
| Independent adversarial test before public release | Required, not done |
