---
"@mindees/ai": patch
"@mindees/atlas": patch
---

Audit hardening for `@mindees/ai` (Synapse) and `@mindees/atlas`. An adversarial review confirmed seven defects (the structured-output/tool-calling allowlist, SSE framing, and mock/research stubs held up); each is fixed with a regression test.

**@mindees/ai**
- **Broken Anthropic auth via the mapper object (high)** — `createServerBackend` chose `x-api-key` auth only when `adapter` was the string `'anthropic'`; passing the exported `anthropicMapper` *object* (supported public API) fell through to `Authorization: Bearer` + no `anthropic-version`, so Anthropic returned 401. Auth now follows the mapper (new `ProviderMapper.auth` field), so the name and object forms authenticate identically.
- **OpenAI stream parser dropped finish/usage on a combined event (medium)** — when one SSE event carried a content delta *and* `finish_reason`/`usage` (common in local OpenAI-compatible servers), the parser early-returned the text-delta and silently lost the terminal finish + token usage. `StreamParser` now returns an array, so an event can emit both the delta and the finish.
- **Abort consistency (low ×2)** — `generate()` now re-checks the abort signal after the round-trip (matching `stream()`/`runTools`), and `stream()` checks the `[DONE]` sentinel before the abort poll so a completed stream never throws a spurious `ABORTED`.

**@mindees/atlas**
- **`ScrollView horizontal` was a no-op (medium)** — it only set an inert `data-orientation` attribute no backend reads. It now drives real horizontal layout through the curated style subset (`flexDirection: 'row'` + `overflow: 'auto'` + `flexWrap: 'nowrap'`).
- **`Pressable` over-subscribed plain reactive styles (low)** — every function `style` was treated as an interaction-state fn, so an ordinary reactive style re-ran on every hover/press/focus. State-fns are now distinguished by arity, so a plain `() => StyleInput` accessor only re-runs on its own dependencies.
- **Decorative `Image` kept a contradictory `aria-label` (low)** — a decorative image given both `decorative` and `label` emitted `aria-hidden="true"` *and* `aria-label`; the label is now dropped so a decorative image exposes no accessible name.

Both packages' exported `info` objects are now frozen (consistency).
