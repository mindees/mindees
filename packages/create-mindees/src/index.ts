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
  // An explicit `--template` always wins; the prompt only resolves a template
  // when the caller didn't choose one.
  let template = args.template ?? DEFAULT_TEMPLATE
  if (!args.template && args.prompt && args.prompt.length > 0) {
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

export { naturalLanguageToTemplate } from '@mindees/cli'

/** The npm package name. */
export const name = 'create-mindees'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity. The scaffolder delegates to `@mindees/cli`'s tested core. */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
