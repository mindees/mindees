/**
 * Shared types for Forge — the MindeesNative CLI (`mindees`).
 *
 * @module
 */

/** Exit-code convention: 0 = success, non-zero = failure. */
export type ExitCode = number

/**
 * A line of output, tagged by stream. The CLI core never writes to the console
 * directly — it returns/streams `OutputLine`s so every command is testable.
 */
export interface OutputLine {
  stream: 'out' | 'err'
  text: string
}

/** A sink the CLI writes structured output to (console adapter in `bin`). */
export type Writer = (line: OutputLine) => void

/** The result of running a CLI command. */
export interface CommandResult {
  exitCode: ExitCode
}

/** Severity of a {@link DoctorCheck}. */
export type DoctorStatus = 'ok' | 'warn' | 'fail'

/** One environment check produced by `doctor`. */
export interface DoctorCheck {
  /** Short label, e.g. `"Node.js"`. */
  name: string
  status: DoctorStatus
  /** What was found, e.g. `"v24.7.0"`. */
  detail: string
  /** Actionable fix shown when `status` is `warn`/`fail`. */
  fix?: string
}

/**
 * A snapshot of the environment, injected into `doctor` so it is fully
 * deterministic in tests (no real `process`/fs access in the core).
 */
export interface EnvProbe {
  /** Node version string, e.g. `process.version` → `"v24.7.0"`. */
  nodeVersion: string
  /** Detected package manager + version, or `null` if none. */
  packageManager: { name: string; version: string } | null
  /** Whether a `package.json` exists in the working directory. */
  hasPackageJson: boolean
  /** Whether `node_modules` exists (deps installed). */
  hasNodeModules: boolean
}
