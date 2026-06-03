# @mindees/ai

**Synapse** — provider-agnostic AI + dev-time intelligence for MindeesNative.

> Status: 🧪 **Experimental** (Phase 11A — the AI contract). A small, hand-rolled,
> pure-TS contract with a deterministic **mock backend** is implemented and tested. A
> server/HTTP backend (11B), Standard-Schema structured output + tool calling (11C), and
> a dev-time error explainer (11D) build on it. **On-device LLM inference is inherently
> native** (Apple Foundation Models, Android AICore/Gemini Nano, ExecuTorch, llama.rn) or
> web-only (WebGPU/WASM), so it is a 🔬 **research track** — `createOnDeviceBackend()`
> throws `NotImplementedError`; the mock/server backends are the working fallback. See
> the repository [STATUS.md](../../STATUS.md).

## What works today

A provider-agnostic contract every backend implements (`@mindees/core` only, zero
third-party deps):

- **`createAi({ backend })`** → `ai.generate(req)` (one-shot) and `ai.stream(req)`
  (streamed). Streaming is an **`AsyncIterable`** (no Web/Node streams), so it runs on
  Node, browsers, and Hermes/RN. Cancellation via a structural `AbortLike`.
- **`createMockBackend({ reply | script, chunkSize })`** — deterministic, no network, no
  keys: powers tests and offline apps.
- **`createOnDeviceBackend()`** — the research-track seam (same interface, throws).
- Stable `AiError` codes; `Message`/`Part` types whose `tool-call`/`tool-result` parts
  back the (11C) tool loop.

```ts
import { createAi, createMockBackend } from '@mindees/ai'

const ai = createAi({ backend: createMockBackend({ reply: 'Hello from Synapse' }) })

console.log((await ai.generate({ messages: [{ role: 'user', content: 'hi' }] })).text)

for await (const chunk of ai.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
  if (chunk.type === 'text-delta') process.stdout.write(chunk.delta)
}
```

Design rationale: [ADR-0017](../../docs/adr/0017-synapse-ai-contract.md).

## License

`MIT OR Apache-2.0`
