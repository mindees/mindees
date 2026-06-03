import type { Maturity, PackageInfo } from '@mindees/core'
import { NotImplementedError, notImplemented } from '@mindees/core'
import { VERSION } from './version'

/** AI command handler (used by `runCliAsync`; exposed for embedders). */
export { type AiCommandContext, runAiCommand } from './ai'
/** Project build (via @mindees/compiler). */
export { type BuildOptions, type BuildResult, buildProject } from './build'
/** CLI dispatch. `runCli` is synchronous; `runCliAsync` adds the async `ai` command. */
export { type CliContext, runCli, runCliAsync } from './cli'
/** Create target path + package-name resolution. */
export {
  type CreateTarget,
  type CreateTargetResult,
  quoteShellPath,
  resolveCreateTarget,
} from './create-target'
/** Dev orchestrator (rebuild-on-change). */
export { type DevOptions, type DevSession, startDev, type Watcher } from './dev'
/** Environment diagnostics. */
export { doctorSummary, renderDoctor, runDoctor } from './doctor'
/** Filesystem abstraction. */
export { createMemoryFileSystem, type FileSystem } from './fs'
/** Natural-language → template mapping (offline; AI is Phase 10). */
export { naturalLanguageToTemplate, type TemplatePick } from './nl'
/** Scaffolding. */
export {
  type ScaffoldOptions,
  type ScaffoldResult,
  scaffold,
} from './scaffold'
/** Templates. */
export {
  DEFAULT_TEMPLATE,
  getTemplate,
  materialize,
  TEMPLATES,
  type Template,
  templateNames,
} from './templates'
/** Shared types. */
export type {
  CommandResult,
  DoctorCheck,
  DoctorStatus,
  EnvProbe,
  ExitCode,
  OutputLine,
  Writer,
} from './types'

/** The npm package name. */
export const name = '@mindees/cli'

/** The package version. All `@mindees/*` packages share one locked version line. */
export { VERSION }

/**
 * Current maturity. The CLI core — dispatch, `create` (+ templates), `build`
 * (via the compiler), `doctor`, `info`, and the dev rebuild orchestrator — is
 * implemented and tested. The live dev-server HTTP/HMR transport is a developer
 * preview; on-device NL→app generation is Phase 10 (today `--prompt` maps to a
 * template deterministically).
 */
export const maturity: Maturity = 'experimental'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }

export type { Maturity, PackageInfo }
export { NotImplementedError, notImplemented }
