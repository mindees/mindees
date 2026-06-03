/**
 * `mindees ai` — dev-time AI helpers. Currently `ai explain <error>`, which runs Synapse's
 * {@link explainError} (from `@mindees/ai/devtools`) over an injected backend and prints a
 * structured explanation. Like every command, it's a pure function of injected capabilities
 * (the backend + writer), so it's deterministically testable with the mock backend; the real
 * `bin` wires a server backend from environment variables.
 *
 * @module
 */

import type { AiBackend } from '@mindees/ai'
import { explainError, formatExplanation } from '@mindees/ai/devtools'
import type { CommandResult, Writer } from './types'

/** What `runAiCommand` needs (injected for testability). */
export interface AiCommandContext {
  write: Writer
  /** The AI backend; absent when no `MINDEES_AI_*` env is configured. */
  backend?: AiBackend
}

const AI_HELP = `mindees ai — dev-time AI helpers

Usage:
  mindees ai explain <error message...>   Explain an error and suggest fixes

Configure a backend with environment variables:
  MINDEES_AI_BASE_URL   e.g. https://api.openai.com/v1
  MINDEES_AI_MODEL      e.g. gpt-4o-mini
  MINDEES_AI_API_KEY    your key
  MINDEES_AI_ADAPTER    openai (default) | anthropic`

function out(write: Writer, text: string): void {
  write({ stream: 'out', text })
}
function err(write: Writer, text: string): void {
  write({ stream: 'err', text })
}

/** Run an `ai` subcommand. Async because it talks to a model. */
export async function runAiCommand(
  args: readonly string[],
  ctx: AiCommandContext,
): Promise<CommandResult> {
  const [sub, ...rest] = args

  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    out(ctx.write, AI_HELP)
    return { exitCode: 0 }
  }
  if (sub !== 'explain') {
    err(ctx.write, `Unknown ai command "${sub}". Try \`mindees ai explain <error>\`.`)
    return { exitCode: 1 }
  }

  const message = rest.join(' ').trim()
  if (!message) {
    err(ctx.write, 'ai explain: provide an error message. Usage: mindees ai explain <error>')
    return { exitCode: 1 }
  }
  if (!ctx.backend) {
    err(
      ctx.write,
      'No AI backend configured. Set MINDEES_AI_BASE_URL and MINDEES_AI_MODEL (and MINDEES_AI_API_KEY if your provider needs one).',
    )
    return { exitCode: 1 }
  }

  try {
    const explanation = await explainError(ctx.backend, { message })
    out(ctx.write, formatExplanation(explanation))
    return { exitCode: 0 }
  } catch (e) {
    err(ctx.write, `ai explain failed: ${e instanceof Error ? e.message : String(e)}`)
    return { exitCode: 1 }
  }
}
