---
"@mindees/ai": minor
---

Add **`withCache`** — wrap any `AiBackend` so identical one-shot `generate` requests return a memoized
result instead of re-hitting the provider (cuts latency + token cost for deterministic prompts/dev loops).
Bounded LRU + optional `ttlMs`; injectable `now` + `keyOf`. Compose with `withRetry` for resilient,
cached AI calls. Streaming passes through unwrapped.
