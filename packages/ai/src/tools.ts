/**
 * The Synapse bounded tool-calling loop. `runTools` drives a model that can call tools:
 * generate → (validate args → execute tools → feed results back) → repeat, until the model
 * answers with text or a hard step ceiling is hit. Built purely on `AiBackend.generate`, so
 * the deterministic mock (scripted tool-call mode) exercises the whole loop offline.
 *
 * Safety is the point (tool args are model-produced ⇒ untrusted, tools can have side effects):
 * a hard `maxSteps` ceiling; deep prototype-pollution rejection + Standard-Schema validation
 * of **args** BEFORE any `execute`; invalid args are fed back as a recoverable tool-result (not
 * a thrown error); each `execute` is isolated (one tool's throw can't abort the batch);
 * identical repeated calls share ONE execution (no duplicate side effects, even within a
 * parallel turn); parallel execution with deterministic (request-order) result history;
 * four-point abort polling. See `docs/adr/0020-synapse-tool-calling.md`.
 *
 * Note: a tool's RETURN value is the tool author's responsibility and is passed through to the
 * transcript/caller as-is (not deep-sanitized) — it may be a rich object (Date, class). If a
 * tool returns untrusted fetched data, the tool should sanitize it before returning.
 *
 * @module
 */

import type {
  AbortLike,
  AiBackend,
  FinishReason,
  GenerateRequest,
  Message,
  Part,
  ToolCallPart,
  ToolDefinition,
  Usage,
} from './contract'
import { AiError } from './errors'
import { containsForbiddenKey, formatIssues } from './json'
import type { StandardSchemaV1 } from './standard-schema'

/** Context passed to a {@link Tool}'s `execute`. */
export interface ToolContext {
  /** Cancellation — long-running tools should honor it. */
  readonly signal?: AbortLike
}

/** A callable tool: the wire {@link ToolDefinition} plus runtime validation + `execute`. */
export interface Tool {
  readonly name: string
  readonly description?: string
  /** JSON Schema for the args, sent to the provider verbatim. */
  readonly parameters?: Record<string, unknown>
  /** Optional Standard Schema validating the model's args before `execute` (sync only). */
  readonly validate?: StandardSchemaV1
  /** Run the tool. Receives validated, pollution-checked args. */
  readonly execute: (args: unknown, context: ToolContext) => unknown | Promise<unknown>
}

/** Options for {@link runTools}. */
export interface RunToolsOptions {
  /** Hard ceiling on model calls (one `generate` = one step). Default `8`. */
  readonly maxSteps?: number
  /** Cancellation, polled before/after every generate and execute. */
  readonly signal?: AbortLike
  /** Run a turn's tool calls sequentially instead of in parallel. Default `false`. */
  readonly sequential?: boolean
  /** Throw `TOOL_FAILED` on an `execute` throw instead of feeding the error back. Default `false`. */
  readonly throwOnToolError?: boolean
  /** Truncate a stringified tool result longer than this before feeding it back. */
  readonly maxToolResultChars?: number
  /** Sampling temperature forwarded to the backend. */
  readonly temperature?: number
  /** Output-token cap forwarded to the backend. */
  readonly maxOutputTokens?: number
}

/** The result of {@link runTools}. */
export interface RunToolsResult {
  /** The model's final text answer. */
  readonly text: string
  /** How many model calls were made. */
  readonly steps: number
  /** The full accumulated transcript (caller's input is never mutated). */
  readonly messages: readonly Message[]
  /** Accumulated usage across all steps, when reported. */
  readonly usage?: Usage
  /** The final finish reason. */
  readonly finishReason: FinishReason
}

/** A structured tool-result payload fed back to the model on a recoverable problem. */
interface ToolErrorResult {
  readonly error: 'unknown_tool' | 'invalid_arguments' | 'tool_failed'
  readonly message: string
}

/**
 * Deterministic JSON with sorted object keys (order-independent dedup key + size estimate).
 * Cycle- and bigint-safe so it never throws on a tool result: a back-reference becomes
 * `"[Circular]"` and a bigint its decimal string. (Dedup keys come from validated JSON args,
 * which can't cycle; the safety matters for `truncateResult` on arbitrary tool output.)
 */
function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (typeof value === 'bigint') return `"${value.toString()}"`
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (seen.has(value)) return '"[Circular]"'
  seen.add(value)
  const out = Array.isArray(value)
    ? `[${value.map((v) => stableStringify(v, seen)).join(',')}]`
    : `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map(
          (k) =>
            `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k], seen)}`,
        )
        .join(',')}}`
  seen.delete(value)
  return out
}

function addUsage(a: Usage | undefined, b: Usage | undefined): Usage | undefined {
  if (!a) return b
  if (!b) return a
  const sum: { inputTokens?: number; outputTokens?: number } = {}
  if (a.inputTokens !== undefined || b.inputTokens !== undefined) {
    sum.inputTokens = (a.inputTokens ?? 0) + (b.inputTokens ?? 0)
  }
  if (a.outputTokens !== undefined || b.outputTokens !== undefined) {
    sum.outputTokens = (a.outputTokens ?? 0) + (b.outputTokens ?? 0)
  }
  return sum
}

/** Validate args synchronously (tool schemas must be sync — an async validator throws). */
function validateArgsSync(
  tool: Tool,
  args: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!tool.validate) return { ok: true, value: args }
  const raw = tool.validate['~standard'].validate(args)
  if (raw instanceof Promise) {
    throw new AiError(
      'TOOL_FAILED',
      `tool "${tool.name}" has an async argument schema (unsupported)`,
    )
  }
  if (typeof raw !== 'object' || raw === null)
    return { ok: false, message: 'validator returned no result' }
  if (raw.issues)
    return { ok: false, message: formatIssues(Array.isArray(raw.issues) ? raw.issues : []) }
  return { ok: true, value: raw.value }
}

function truncateResult(result: unknown, maxChars: number | undefined): unknown {
  if (maxChars === undefined) return result
  const serialized = stableStringify(result)
  if (serialized.length <= maxChars) return result
  return { error: 'tool_result_truncated', message: `result exceeded ${maxChars} chars` }
}

/**
 * Run the bounded tool-calling loop.
 *
 * @throws AiError `MAX_STEPS` if the step ceiling is reached, `ABORTED` on cancellation,
 * `TOOL_FAILED` only when `throwOnToolError` is set and an `execute` throws.
 * @throws TypeError for tool-definition misconfiguration (duplicate/empty names).
 */
export async function runTools(
  backend: Pick<AiBackend, 'generate'>,
  request: GenerateRequest,
  tools: readonly Tool[],
  options: RunToolsOptions = {},
): Promise<RunToolsResult> {
  const maxSteps = options.maxSteps ?? 8
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new TypeError('maxSteps must be an integer >= 1')
  }
  const signal = options.signal ?? request.signal

  // Validate tool definitions up front (programmer error, not a model error).
  const byName = new Map<string, Tool>()
  for (const tool of tools) {
    if (!tool.name) throw new TypeError('every tool must have a non-empty name')
    if (byName.has(tool.name)) throw new TypeError(`duplicate tool name "${tool.name}"`)
    byName.set(tool.name, tool)
  }
  const definitions: ToolDefinition[] = tools.map((t) =>
    t.parameters === undefined
      ? { name: t.name, ...(t.description !== undefined ? { description: t.description } : {}) }
      : {
          name: t.name,
          parameters: t.parameters,
          ...(t.description !== undefined ? { description: t.description } : {}),
        },
  )

  const messages: Message[] = [...request.messages]
  // One promise per (name,args) for the whole run: concurrent identical calls share it (no
  // double-fire in a parallel turn) AND a later identical call reuses the settled outcome —
  // success OR failure — so a throwing tool isn't re-executed either (no duplicate side
  // effects). The per-call error POLICY (throw vs feed-back) is applied at await, not cached.
  const callCache = new Map<string, Promise<unknown>>()
  let usage: Usage | undefined
  let steps = 0

  const aborted = (): boolean => signal?.aborted === true

  // Execute one validated call (or produce a fed-back error result). Honors abort + dedup.
  const runCall = async (call: ToolCallPart): Promise<unknown> => {
    const tool = byName.get(call.name)
    if (!tool) {
      return {
        error: 'unknown_tool',
        message: `no tool named "${call.name}"`,
      } satisfies ToolErrorResult
    }
    if (containsForbiddenKey(call.args)) {
      return {
        error: 'invalid_arguments',
        message: 'arguments contain a forbidden key',
      } satisfies ToolErrorResult
    }
    const validated = validateArgsSync(tool, call.args)
    if (!validated.ok) {
      return { error: 'invalid_arguments', message: validated.message } satisfies ToolErrorResult
    }
    const key = `${tool.name}:${stableStringify(validated.value)}`
    let exec = callCache.get(key)
    if (!exec) {
      if (aborted()) throw new AiError('ABORTED', 'tool loop aborted')
      exec = (async () => {
        const ctx: ToolContext = signal ? { signal } : {}
        const raw = await tool.execute(validated.value, ctx)
        if (aborted()) throw new AiError('ABORTED', 'tool loop aborted')
        return truncateResult(raw, options.maxToolResultChars)
      })()
      callCache.set(key, exec)
    }
    try {
      return await exec
    } catch (err) {
      if (err instanceof AiError && err.code === 'ABORTED') throw err
      if (options.throwOnToolError) {
        throw new AiError('TOOL_FAILED', `tool "${tool.name}" failed: ${errorMessage(err)}`)
      }
      return { error: 'tool_failed', message: errorMessage(err) } satisfies ToolErrorResult
    }
  }

  // The loop is bounded by the maxSteps check below (throws MAX_STEPS) and by terminal turns.
  for (;;) {
    if (steps >= maxSteps) {
      throw new AiError('MAX_STEPS', `tool loop exceeded ${maxSteps} steps`)
    }
    if (aborted()) throw new AiError('ABORTED', 'tool loop aborted')

    const req: GenerateRequest = {
      messages,
      tools: definitions,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      ...(signal ? { signal } : {}),
    }
    steps++
    const result = await backend.generate(req)
    usage = addUsage(usage, result.usage)
    if (aborted()) throw new AiError('ABORTED', 'tool loop aborted')

    const calls = result.toolCalls ?? []
    // Drive on tool-call presence, not finishReason: 'tool-calls' with no calls is terminal,
    // and a provider that under-reports finishReason but includes calls still executes them.
    if (calls.length === 0) {
      // Record the final assistant answer so the returned transcript is complete (callers may
      // resume from `messages`).
      if (result.text) messages.push({ role: 'assistant', content: result.text })
      // Normalize a stale 'tool-calls' (no calls actually emitted) to 'stop' so a caller
      // branching on the result's finishReason isn't told work is still pending.
      const finishReason: FinishReason =
        result.finishReason === 'tool-calls' ? 'stop' : result.finishReason
      return usage === undefined
        ? { text: result.text, steps, messages, finishReason }
        : { text: result.text, steps, messages, usage, finishReason }
    }

    // Record the assistant turn (text part, if any, then the tool-call parts).
    const assistantParts: Part[] = []
    if (result.text) assistantParts.push({ type: 'text', text: result.text })
    for (const c of calls) assistantParts.push(c)
    messages.push({ role: 'assistant', content: assistantParts })

    if (aborted()) throw new AiError('ABORTED', 'tool loop aborted')

    // Execute (parallel by default), but append results in the model's REQUESTED order so the
    // transcript is deterministic regardless of completion order.
    let results: unknown[]
    if (options.sequential) {
      results = []
      for (const call of calls) results.push(await runCall(call))
    } else {
      results = await Promise.all(calls.map((call) => runCall(call)))
    }
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      if (!call) continue
      messages.push({
        role: 'tool',
        content: [{ type: 'tool-result', id: call.id, name: call.name, result: results[i] }],
      })
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
