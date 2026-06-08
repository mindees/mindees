import {
  DEFAULT_TEMPLATE,
  type FileSystem,
  naturalLanguageToTemplate,
  type ScaffoldResult,
  scaffold,
} from '@mindees/cli'
import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'

/** Arguments accepted by `create-mindees` (after the app name). */
export interface CreateArgs {
  appName: string
  targetDir: string
  template?: string
  /** Free-text prompt → template (offline keyword mapping; AI is Phase 10). */
  prompt?: string
  force?: boolean
}

/**
 * Scaffold a new MindeesNative app. Thin wrapper over `@mindees/cli`'s tested
 * {@link scaffold}, adding the `--prompt` → template resolution so
 * `npm create mindees` and `mindees create` behave identically.
 */
export function runCreate(fs: FileSystem, args: CreateArgs): ScaffoldResult {
  // A non-empty explicit `--template` always wins; an empty or absent one defers to
  // the prompt, else the default. (Treating empty as "not chosen" keeps this in lock-
  // step with `mindees create` — both normalize `--template ""` the same way.)
  const explicit = args.template && args.template.length > 0 ? args.template : undefined
  let template = explicit ?? DEFAULT_TEMPLATE
  if (!explicit && args.prompt && args.prompt.length > 0) {
    template = naturalLanguageToTemplate(args.prompt).template
  }
  const options: Parameters<typeof scaffold>[1] = {
    appName: args.appName,
    targetDir: args.targetDir,
    template,
    force: args.force === true,
  }
  return scaffold(fs, options)
}

/** The npm package name. */
export const name = 'create-mindees'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.34.1'

/** Current maturity. The scaffolder delegates to `@mindees/cli`'s tested core. */
export const maturity: Maturity = 'experimental'

/**
 * Static identity + maturity metadata for this package. Frozen so the
 * self-reported identity tooling introspects cannot be mutated at runtime,
 * matching the `readonly` fields of {@link PackageInfo}.
 */
export const info: PackageInfo = Object.freeze({ name, version: VERSION, maturity })

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
