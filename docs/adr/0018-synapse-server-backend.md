# ADR-0018: Synapse (Phase 11B) — capability-injected HTTP/SSE backend

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

11A shipped the `AiBackend` contract + a mock backend. 11B adds the first **real**
backend: an HTTP client that talks to a hosted model API and implements the same
contract. It must stay pure-TS and provider-agnostic, with **no vendor SDK** and **no
Web `ReadableStream` / Node stream in the public surface**, and be unit-testable with
**zero real network**.

## Decision

### Capability-injected transport (`./server` subpath)
`createServerBackend({ fetch, baseUrl, model, apiKey?, adapter, headers })` — **`fetch`
is injected** (exactly like Pulse's `fetchManifest`/`fetchAsset`), typed by a minimal
structural `FetchLike`/`ResponseLike` (no DOM lib), so it runs on Node, browsers, and
Hermes and is testable with a fake transport. It implements `AiBackend.generate`
(one-shot JSON) and `AiBackend.stream` (SSE → `AsyncIterable<AiChunk>`).

### Pure-TS SSE parser (`sse.ts`)
`parseSse(chunks: AsyncIterable<string>): AsyncIterable<SseMessage>` — a hand-rolled
line/event parser (no `eventsource` dep): buffers across chunk boundaries, joins
multi-line `data:` fields, skips comments (`:` lines) and blank keep-alives, and stops
at the `[DONE]` sentinel. `decodeChunks(AsyncIterable<Uint8Array>)` adapts a byte body to
strings via `TextDecoder`. The server backend reads `response.body` (async-iterable on
Node/modern fetch) through this; tests feed **string fixtures** directly.

### Provider mappers (`mappers.ts`)
A small per-provider mapper isolates the wire shape so the core never imports a vendor
SDK and a provider change is a contained edit:
- **`openai`** — `POST {baseUrl}/chat/completions`; maps messages → `messages[]`, reads
  `choices[0].message.content` / streamed `choices[0].delta.content`, `finish_reason`,
  and `usage`. Covers OpenAI **and** the many OpenAI-compatible servers (local models,
  gateways).
- **`anthropic`** — `POST {baseUrl}/v1/messages`; maps system → top-level `system`,
  reads `content[].text` / streamed `content_block_delta`, `stop_reason`, and `usage`.

Each mapper is **table-tested against recorded golden SSE/JSON fixtures** — multi-line
`data:`, `[DONE]`, comment keep-alives, and JSON split across chunk boundaries — with
no real network.

### Errors & hardening
`AiError` codes (from 11A): `NO_TRANSPORT` (no `fetch`), `HTTP_STATUS` (non-2xx, with
the status + a **truncated** body — never the request/headers, so the API key can't leak),
`STREAM_PARSE` (malformed SSE JSON), `ABORTED`. Hardening decisions (each regression-tested):
- **Memory cap** — the SSE parser caps un-dispatched state at ~8M chars and throws
  `STREAM_PARSE` rather than growing unboundedly. This bounds **both** a single line that
  never gets a newline **and** an event whose `data:` lines accumulate without a blank-line
  terminator (the latter also being what would otherwise stall the mid-stream abort, since
  the parser yields nothing while accumulating).
- **Abort, before *and* mid-stream** — `signal.aborted` is checked before `fetch` *and*
  on every dispatched SSE message, so an in-flight stream stops promptly (not only at the
  next network read).
- **Streamed usage capture** — with OpenAI `stream_options.include_usage`, token usage
  arrives on a trailing `choices: []` chunk that carries no `finish_reason`. The openai
  mapper is built via a **per-stream** `createStreamParser()` that remembers the last real
  `finish_reason`, so the usage-bearing `finish` reports the true reason (not a fabricated
  `stop`) and usage isn't silently dropped. (Per-stream, not a shared singleton, so
  concurrent streams don't cross-contaminate.)
- **Untrusted JSON** — all response/stream parsing is defensive (`asRecord`/`asString`/
  `asNumber`); `finish_reason`/`stop_reason` lookups use **null-prototype** maps so a
  hostile value like `__proto__` reads as the `stop` fallback, never an inherited member.

## Consequences
- A real, working server backend behind the same `AiBackend` seam, fully tested with a
  fake `fetch` + golden fixtures (zero network). Lives at `@mindees/data`-style
  `./server` subpath so the device entry stays lean. Zero new runtime deps.
- Tool-call mapping is deliberately out of scope here (tools are added to the request in
  11C); the mappers handle text + finish + usage now and gain tool mapping in 11C.

## Alternatives considered
- **`eventsource` / `@microsoft/fetch-event-source`** — rejected: a dep for a ~40-line
  parser; many are DOM/Node-coupled. Hand-rolled is portable + golden-fixture-tested.
- **Expose `response.body` (ReadableStream) to callers** — rejected: keeps Web/Node
  stream types out of the public contract (`AsyncIterable` only); the stream is consumed
  internally. (RN's `fetch` rarely streams response bodies — documented; the mock
  backend + non-streaming `generate` are the RN-safe paths.)
- **One mapper hardcoded to OpenAI** — rejected: a thin `adapter` switch keeps it
  provider-agnostic for the same cost.
