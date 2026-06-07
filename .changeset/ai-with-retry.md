---
"@mindees/ai": minor
---

Add **`withRetry`** — wrap any `AiBackend` so one-shot `generate` retries transient failures (network
blips, 429s, 5xx) with exponential backoff. Configurable `maxAttempts`/`shouldRetry`/`backoffMs` and an
injectable `sleep` (deterministic tests). Streaming passes through unwrapped (mid-stream can't resume).
