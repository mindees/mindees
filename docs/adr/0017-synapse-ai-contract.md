# ADR-0017: Synapse (Phase 11A) — provider-agnostic AI contract + mock backend

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

Phase 11 (`@mindees/ai`, **Synapse**) is on-device + dev-time intelligence. Research
(live-verified) settled the foundation: **every** on-device LLM runtime is either native
(Apple Foundation Models, Android AICore/Gemini Nano, ExecuTorch, llama.rn) or web-only
(WebLLM, Transformers.js, MediaPipe — WebGPU/WASM, which Hermes lacks). **None run as
pure JS on the Hermes/RN device path.** So on-device inference is a labeled research
track, and the **real, shipped core is a provider-agnostic contract** with backends that
work everywhere: a deterministic **mock** and (11B) an inject-`fetch` **server** backend.
This ADR ships 11A — the contract, the mock backend, and the throwing on-device seam.

## Decision

A small, **fully hand-rolled, pure-TS** contract (no `ai`/vendor SDK — those leak Web
`ReadableStream` and drag transitive deps; we are design-informed by them only). Runtime
deps stay `@mindees/core` only; the Standard Schema types (for 11C) are vendored as in
the router.

### The contract (`contract.ts`)
- **Messages** — `Message { role: 'system'|'user'|'assistant'|'tool', content: string |
  Part[] }`; `Part = TextPart | ToolCallPart | ToolResultPart` (the tool parts back the
  11C tool loop; image/file parts are reserved).
- **`AiBackend`** — the single seam **all** backends implement:
  `generate(req): Promise<AiResult>` and `stream(req): AsyncIterable<AiChunk>`.
  **Async iterables only** — no Web `ReadableStream`, no Node streams in the public
  surface, so it runs on Node, browsers, and Hermes. Cancellation via a structural
  `AbortLike { aborted }` on the request (a real `AbortSignal` is compatible).
- **`GenerateRequest`** = `{ messages, temperature?, maxOutputTokens?, signal? }`
  (`tools` + `output` are added, additively, in 11C — designed to mirror Apple
  Foundation Models' guided-generation + tool-calling so the native track is a
  non-breaking drop-in).
- **`AiResult`** = `{ text, toolCalls?, finishReason, usage? }`;
  **`AiChunk`** = `text-delta | tool-call | finish`. A stream **throws** an `AiError` on
  failure (idiomatic async-iterator error) rather than yielding an error chunk.
- **`createAi({ backend })`** — the thin entry the app holds.

### Backends shipped in 11A
- **`createMockBackend({ reply | script, chunkSize })`** — deterministic, no network, no
  keys: the analog of `createMemoryHub`. `generate` returns the scripted reply;
  `stream` chunks it into `text-delta`s then `finish`. Honors `signal.aborted` (throws
  `AiError('ABORTED')`). It powers **all** unit tests and lets apps run fully offline —
  the working fallback that keeps the on-device research track honest.
- **`createOnDeviceBackend()`** — the **research-track** seam: implements the *same*
  `AiBackend` interface but `generate`/`stream` call `notImplemented('ai.onDevice')` →
  `NotImplementedError`. Identical shape ⇒ a native runtime
  (`react-native-executorch` / Foundation Models / AICore) drops in later
  non-breakingly. Documented as not shipped; mock/server are the fallback.

### Errors
`class AiError extends Error { readonly code: AiErrorCode }` (mirrors `UpdateError`).
The code union is defined whole now (`NO_TRANSPORT`, `HTTP_STATUS`, `STREAM_PARSE`,
`INVALID_OBJECT`, `MAX_STEPS`, `TOOL_FAILED`, `ABORTED`, `NOT_IMPLEMENTED`) so later
sub-phases add behavior, not new public types.

## Consequences
- A real, test-backed AI surface from day one (mock backend + headless tests, zero
  network/keys). `@mindees/ai` → 🧪 experimental; the on-device backend is 🔬.
- The single `AiBackend` seam is proven by two implementations (mock + on-device stub)
  immediately, so the server backend (11B), structured output + tools (11C), and the
  dev-time explainer (11D) extend it without contract churn.

## Alternatives considered
- **Depend on `ai` (Vercel AI SDK) / vendor SDKs / LangChain** — rejected: Web
  `ReadableStream` at the core (Hermes-unsafe), heavy transitive deps, one-per-provider
  / over-scoped. Vendor-SDK adapters may live in `examples/` later, fulfilling the
  injected transport — never a core dep.
- **Streams as the contract's streaming type** — rejected for `AsyncIterable` (portable
  to Node/web/Hermes; `response.body` access is hidden behind the server backend in 11B).
- **Ship a web-only WebLLM/Transformers.js backend now** — rejected: WebGPU/WASM,
  web-only, would break the cross-platform promise + pull a heavy dep into core. A
  separate opt-in adapter at most, later.
