# ADR-0019: Synapse (Phase 11C) — structured output

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

11A/11B shipped the `AiBackend` contract + mock + server backends. 11C adds **structured
output**: `generateObject` / `streamObject` that return a value validated against any
Standard Schema (Zod, Valibot, ArkType, …). Model output is **untrusted text**, so this is
security-sensitive: prototype pollution, resource exhaustion, and `eval` are all in scope.
It must stay pure-TS, dependency-clean (`@mindees/core` only), and work on every backend
(including the offline mock).

## Decision

### Built purely on top of `AiBackend`

`generateObject(backend, request, schema, options?)` and `streamObject(...)` are implemented
**only** on `AiBackend.generate` / `stream` — prompt-injected JSON instruction → extract →
sanitize → validate → (repair). So the deterministic mock exercises the whole path offline,
and every backend gets structured output for free. No native structured-output API is
required or used.

### No JSON-Schema generation (honest agnosticism)

Standard Schema has **no introspection** — there is no way to turn an arbitrary validator
into a JSON Schema to send the model. So Synapse instructs the model to emit JSON and
**validates**; it does **not** describe the field shape for you. Callers describe the desired
shape in their own prompt. This keeps Synapse validator-agnostic and honest (no zod-only
`zod-to-json-schema` path).

### The pipeline (`json.ts`, fail-closed, no `eval`)

1. **`extractJson(text)`** — fixed, testable order: parse the whole trimmed text → parse the
   first fenced ```` ``` ```` block → parse the first balanced `{…}`/`[…]` span (string- and
   escape-aware). No capturing regex, no `eval`. Exported + golden-tested.
2. **`sanitizeJson(value, limits?)`** — deep-clones the parsed value into a fresh object,
   throwing `AiError('INVALID_OBJECT')` on any `__proto__`/`constructor`/`prototype` own key
   **at any depth** or any depth/node/string/prop limit breach. Run **before** validation —
   a validator can itself pollute the prototype by touching a poisoned object. (Reuses the
   shipped `@mindees/updates` SDUI defense pattern.)
3. **`validateStandard(schema, clean)`** — awaits sync **or async** validators, discriminates
   on `issues` truthiness (a valid output may be `undefined`), and defensively narrows a
   malformed validator result (non-array `issues`) into a failure rather than crashing.

**Size gate before parse.** A `maxInputChars` ceiling (~8M, mirroring the SSE backend's
`MAX_SSE_BUFFER`) is enforced at the top of `extractJson`/`lenientParseJson` and on the
accumulated `streamObject` buffer — so a hostile payload is rejected **before** `JSON.parse`
materializes it, not only by the post-parse `sanitizeJson` limits.

**`formatIssues`** `String()`-coerces each path segment (a key may be a `symbol` — `Array.join`
would otherwise throw and break the fail-closed `AiError` contract).

### Bounded repair

`maxRepairs` counts **only re-asks** (default `2`) ⇒ total model calls = `1 + maxRepairs`.
`signal.aborted` is checked at the **top of every iteration** (→ `AiError('ABORTED')`); usage
is **accumulated** across attempts. The repair turn rebuilds from the original request +
**only** the single last failed reply + a correction carrying the concrete Standard-Schema
issues (`path: message`) — never an ever-growing transcript. A pollution/limit failure is a
**hard** `INVALID_OBJECT` (not repaired). The final `INVALID_OBJECT` carries the last
`issues` (mirrors `RouterError`).

### `streamObject`

Passes raw `text-delta`s through; optionally (opt-in) emits best-effort `partial-object`
previews from a lenient incremental parser, flagged `validated: false` and typed `unknown`
(unvalidated — UI hints only). Previews are **throttled to structural-close deltas** (`}`/`]`)
to avoid re-parsing the whole buffer on every token, and a preview that carries a poison key
(`__proto__`/`constructor`/`prototype`) is **skipped** (so a naive consumer deep-merge can't
be weaponized). The assembled value is sanitized + validated **exactly once** at stream end
(`{ type: 'object', validated: true }`); there is no mid-stream repair (a stream can't be
un-sent) — a hard-invalid final value throws after the stream completes.

## Consequences

- Validator-agnostic structured output behind any backend, fully tested offline against the
  mock. Lives on the main `.` entry (device-safe; no `fetch`/DOM). `StandardSchemaV1` is
  **vendored** into `packages/ai/src/standard-schema.ts` (copied from the router) — zero
  runtime deps, no `@mindees/router` import.
- `AiError` gained an optional `issues` field (exactOptionalPropertyTypes-safe).
- Tool calling (the other half of 11C) builds on the same `extractJson`/`sanitizeJson`/
  `validateStandard` primitives and is shipped next (ADR-0020).

## Alternatives considered

- **`zod-to-json-schema` + provider JSON-mode** — rejected: zod-specific, breaks
  validator-agnosticism, and pulls a dep. Prompt-and-validate works with every validator.
- **Validate every streamed partial** — rejected: a half-streamed object fails required-field
  checks on every chunk (noise + cost); there is no "partial" mode in Standard Schema.
  Validate once at the end; previews are explicitly unvalidated.
- **Sanitize after validate (or shallow check)** — rejected: a validator can pollute via a
  poisoned object before a post-hoc check runs, and a top-level-only check misses nested
  `__proto__`. Deep sanitize-clone **before** validate is the only safe order.
