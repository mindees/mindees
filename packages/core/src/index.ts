import type { Maturity, PackageInfo } from './types'

export { NotImplementedError } from './errors'
export { notImplemented } from './not-implemented'
export type { Maturity, PackageInfo } from './types'

/** The npm package name. */
export const name = '@mindees/core'

/** The package version. All `@mindees/*` packages share one locked version line. */
export const VERSION = '0.0.0'

/** Current maturity of this package. See the repository `STATUS.md`. */
export const maturity: Maturity = 'scaffold'

/** Static identity + maturity metadata for this package. */
export const info: PackageInfo = { name, version: VERSION, maturity }
