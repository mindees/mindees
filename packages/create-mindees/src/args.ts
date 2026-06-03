import { parseArgs } from 'node:util'
import { resolveCreateTarget } from '@mindees/cli'
import type { CreateArgs } from './index'

export const CREATE_USAGE =
  'Usage: create-mindees <app-name-or-path> [--template <name>] [--prompt "..."] [--force]'

export type ParsedCreateCommand =
  | {
      kind: 'help'
      exitCode: 0
      usage: string
    }
  | {
      kind: 'error'
      exitCode: 1
      error: string
      usage: string
    }
  | {
      kind: 'create'
      args: CreateArgs
      displayDir: string
    }

/** Parse `create-mindees` argv into testable command intent. */
export function parseCreateCommand(argv: readonly string[], cwd: string): ParsedCreateCommand {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      template: { type: 'string', short: 't' },
      prompt: { type: 'string', short: 'p' },
      force: { type: 'boolean' },
    },
  })

  if (values.help === true || positionals[0] === 'help') {
    return { kind: 'help', exitCode: 0, usage: CREATE_USAGE }
  }

  const appName = positionals[0]
  if (!appName) {
    return {
      kind: 'error',
      exitCode: 1,
      error: 'create-mindees: missing app name or target path.',
      usage: CREATE_USAGE,
    }
  }

  const target = resolveCreateTarget(appName, cwd)
  if (!target.ok) {
    return { kind: 'error', exitCode: 1, error: target.error, usage: CREATE_USAGE }
  }

  const args: CreateArgs = {
    appName: target.packageName,
    targetDir: target.targetDir,
    force: values.force === true,
  }
  if (typeof values.template === 'string') args.template = values.template
  if (typeof values.prompt === 'string') args.prompt = values.prompt

  return { kind: 'create', args, displayDir: target.displayDir }
}
