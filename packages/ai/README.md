# @mindees/ai

**Synapse** — provider-agnostic AI + dev-time intelligence for MindeesNative.

> Status: 🧪 **Experimental** — Phase 11 (Synapse) is complete in its current scope.
> Implemented and tested: the provider-agnostic AI contract, deterministic mock backend,
> injected-`fetch` server/HTTP backend, Standard-Schema structured output, bounded tool
> calling, and dev-time error explainer. **On-device LLM inference is inherently native**
> (Apple Foundation Models, Android AICore/Gemini Nano, ExecuTorch, llama.rn) or web-only
> (WebGPU/WASM), so it is a 🔬 **research track** — `createOnDeviceBackend()` throws
> `NotImplementedError`; the mock/server backends are the working fallback. See the
> repository [STATUS.md](../../STATUS.md).

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
- **`@mindees/ai/server`** — `createServerBackend({ fetch, baseUrl, model, ... })`
  with OpenAI/Anthropic mappers and a pure-TS SSE parser, tested with fixture fetches
  and no real network.
- **Structured output** — `generateObject` / `streamObject` validate model JSON against
  any Standard Schema, with bounded repair and sanitize-before-validate guards.
- **Tool calling** — `runTools` validates args before execution, deduplicates identical
  calls, supports parallel execution, and preserves an immutable transcript.
- **`@mindees/ai/devtools`** — `explainError` and terminal formatting for build/dev tools;
  surfaced by the CLI as `mindees ai explain <error>`.

```ts
import { createAi, createMockBackend } from '@mindees/ai'

const ai = createAi({ backend: createMockBackend({ reply: 'Hello from Synapse' }) })

console.log((await ai.generate({ messages: [{ role: 'user', content: 'hi' }] })).text)

for await (const chunk of ai.stream({ messages: [{ role: 'user', content: 'hi' }] })) {
  if (chunk.type === 'text-delta') process.stdout.write(chunk.delta)
}
```

Design rationale: [ADR-0017](../../docs/adr/0017-synapse-ai-contract.md),
[ADR-0018](../../docs/adr/0018-synapse-server-backend.md),
[ADR-0019](../../docs/adr/0019-synapse-structured-output.md),
[ADR-0020](../../docs/adr/0020-synapse-tool-calling.md), and
[ADR-0021](../../docs/adr/0021-synapse-devtools.md).

## License

`MIT OR Apache-2.0`
