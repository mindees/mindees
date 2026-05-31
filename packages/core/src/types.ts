/**
 * Maturity level of a MindeesNative package or capability.
 *
 * Mirrors the legend in the repository `STATUS.md`. Used so tooling and
 * consumers can introspect, honestly, how finished a piece of the framework is.
 */
export type Maturity = 'stable' | 'experimental' | 'research-track' | 'planned' | 'scaffold'

/**
 * Static identity + maturity metadata exported by every `@mindees/*` package.
 */
export interface PackageInfo {
  /** The npm package name, e.g. `@mindees/core`. */
  readonly name: string
  /** The package version. All `@mindees/*` packages share one locked version line. */
  readonly version: string
  /** Current maturity of the package. */
  readonly maturity: Maturity
}
