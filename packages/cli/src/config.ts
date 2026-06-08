/**
 * `mindees.config.json` — optional per-project build configuration.
 *
 * Pure over an injected {@link FileSystem} so it's testable. Tolerant by design: a missing or malformed
 * config never throws and never breaks the build (it degrades to defaults) — the CLI's "never throws for
 * expected failures" contract.
 *
 * @module
 */

import type { BudgetOptions, PerfLintOptions } from '@mindees/compiler'
import type { FileSystem } from './fs'

/** Shape of `mindees.config.json`. All fields optional. */
export interface MindeesConfig {
  /** Perf-lint: `true`/`false`, or {@link PerfLintOptions} to tune. CLI default is `true` (warnings). */
  perf?: boolean | PerfLintOptions
  /** Enforce a per-module performance budget (violations fail the build). Opt-in. */
  budget?: BudgetOptions
  /** Title for the emitted `index.html`. */
  appName?: string
}

/** The config filename, resolved against the project root. */
export const CONFIG_FILE = 'mindees.config.json'

/**
 * Load {@link CONFIG_FILE} from `root`. Returns `{}` when absent or unparseable (never throws), so the
 * build always proceeds with defaults.
 */
export function loadConfig(fs: FileSystem, root: string): MindeesConfig {
  const path = root === '.' ? CONFIG_FILE : `${root}/${CONFIG_FILE}`
  if (!fs.exists(path)) return {}
  try {
    const parsed: unknown = JSON.parse(fs.readFile(path))
    return parsed !== null && typeof parsed === 'object' ? (parsed as MindeesConfig) : {}
  } catch {
    return {}
  }
}
