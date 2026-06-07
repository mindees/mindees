/**
 * Single source of truth for the `@mindees/cli` package version.
 *
 * All `@mindees/*` packages share one locked version line (Changesets, fixed
 * group). Keeping it in its own dependency-free module lets both the public
 * package metadata ({@link index}) and the scaffolder's generated
 * `package.json` ({@link templates}) pin to the same value without a circular
 * import.
 *
 * @module
 */

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.22.5'
