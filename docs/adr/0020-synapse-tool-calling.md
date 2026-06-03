# ADR-0020: Synapse (Phase 11C) — tool calling

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

11C structured output (ADR-0019) shipped the untrusted-JSON primitives. The other half of
11C is **tool calling**: a model that, mid-generation, asks to call a tool, gets the result,
and continues. Tool args are model-produced (untrusted) and tools have real side effects, so
the loop is security-critical: runaway cost, prototype pollution, duplicated side effects,
and host-error leakage are all in scope. It must stay pure-TS, `@mindees/core` only, and run
against every backend (including the offline mock).

## Decision

### `runTools(backend, request, tools, options?)` — built on `AiBackend.generate`

A bounded loop: **generate → (validate args → execute tools → feed results back) → repeat**
until the model answers with text or a hard ceiling trips. Implemented purely on
`backend.generate`, so the deterministic mock (scripted tool-call mode) exercises the whole
loop offline; no native tool API is required.

### Named, testable safety contracts

- **Step = one `generate` call.** `maxSteps` (default `8`) is checked **before** each call and
  throws `AiError('MAX_STEPS')` when reached. A whole turn's parallel tool calls count as one
  step (one model round-trip produced them).
- **Validate args BEFORE `execute`.** For each call: deep `containsForbiddenKey` reject
  (`__proto__`/`constructor`/`prototype`) → the tool's optional Standard Schema validated
  **synchronously** (an async tool schema throws). Only clean, validated args reach `execute`.
- **Invalid args are recoverable, not fatal.** Unknown tool name / pollution / schema failure
  are fed back as a structured `tool-result` (`{ error, message }`) so the model self-corrects
  on the next step (bounded by `maxSteps`). `AiError('TOOL_FAILED')` is reserved **only** for
  an `execute` throw (and only surfaced when `throwOnToolError` is set; otherwise the error
  message — never the stack — is fed back).
- **No duplicate side effects.** Identical `(name, sorted-args)` calls within a run are served
  from a cache instead of re-executing.
- **Parallel, deterministic.** A turn's calls run with `Promise.all` (or `sequential`), but
  results are appended to the transcript in the model's **requested order** (not completion
  order) so runs are reproducible.
- **Four-point abort.** `signal.aborted` is polled at the loop top, after `generate`, before
  dispatch, and after each `execute`; the signal is threaded into each `execute(args, { signal })`.
- **Non-mutating transcript.** The caller's `readonly Message[]` is never mutated; `runTools`
  returns `{ text, steps, messages, usage?, finishReason }`. `maxToolResultChars` truncates an
  oversized result before it inflates the next request.
- **Drive on tool-call presence, not `finishReason`.** `'tool-calls'` with no calls is
  terminal (no spin); `'stop'` with calls still executes them (providers under-report).

### First-class, capability-gated tools

`GenerateRequest.tools` is the **wire** shape (`ToolDefinition`: name, description, JSON-Schema
`parameters`) — no `execute`. The openai mapper serializes them to `tools[].function` and
parses `message.tool_calls` (args are a JSON **string** → defensively parsed); the anthropic
mapper serializes to `tools[].input_schema` and parses `tool_use` blocks. The mock gains a
scripted tool-call mode. A backend/custom mapper that can't express tools throws rather than
silently dropping them. As with structured output, `parameters` is a caller-supplied JSON
Schema — Standard Schema has no introspection, so it can't be derived.

**The loop's transcript must round-trip on the wire.** `runTools` appends an assistant message
of tool-call parts and `tool` messages of tool-result parts; both mappers serialize those back
to the provider shape (OpenAI: assistant `tool_calls` + `{ role:'tool', tool_call_id }`;
Anthropic: `tool_use` blocks + a user `tool_result` block). Without this the 2nd step would
lose its tool context — verified by an integration test running `runTools` through a fake
server backend across two turns (not just the mock).

## Consequences

- A safe, bounded, provider-agnostic tool loop on the main `.` entry, fully tested offline.
- Streaming tool-call deltas are **not** parsed yet (the loop uses `generate`); the streaming
  mappers still only handle text/finish. A future enhancement.

## Alternatives considered

- **Throw on invalid args** — rejected: a model's bad JSON is recoverable; feeding the issues
  back lets it self-correct, bounded by `maxSteps`. `TOOL_FAILED` is reserved for `execute`.
- **Count tool executions as steps** — rejected: ambiguous (a turn may request N tools); a
  step = one model round-trip is the unambiguous, testable cost cap.
- **Derive the wire schema from the Standard Schema** — impossible (no introspection); the
  caller supplies the JSON Schema, honestly.
