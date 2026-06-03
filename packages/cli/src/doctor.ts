/**
 * `mindees doctor` — environment diagnostics with actionable fixes.
 *
 * Directly attacks the "cryptic error" pain point: instead of a confusing
 * failure later, `doctor` checks the environment up front and tells you exactly
 * what to do. The check logic is pure over an injected {@link EnvProbe}, so it's
 * fully deterministic in tests; the `bin` layer supplies the real probe.
 *
 * @module
 */

import type { DoctorCheck, EnvProbe } from './types'

/** Minimum supported Node.js major (matches the repo's engines floor). */
const MIN_NODE_MAJOR = 22
const PNPM_EXEC_FALLBACK = 'npm exec --yes --package=pnpm@11.5.0 -- pnpm'

function parseMajor(version: string): number | null {
  const m = version.match(/^v?(\d+)\./)
  return m?.[1] ? Number.parseInt(m[1], 10) : null
}

/**
 * Run the environment checks against `env`. Pure + deterministic: returns the
 * structured checks; rendering and `process` access live elsewhere.
 */
export function runDoctor(env: EnvProbe): DoctorCheck[] {
  const checks: DoctorCheck[] = []

  // Node version.
  const major = parseMajor(env.nodeVersion)
  if (major === null) {
    checks.push({
      name: 'Node.js',
      status: 'warn',
      detail: `unrecognized version "${env.nodeVersion}"`,
      fix: `Install Node.js ${MIN_NODE_MAJOR} LTS or newer.`,
    })
  } else if (major < MIN_NODE_MAJOR) {
    checks.push({
      name: 'Node.js',
      status: 'fail',
      detail: `${env.nodeVersion} (need >= ${MIN_NODE_MAJOR})`,
      fix: `Upgrade to Node.js ${MIN_NODE_MAJOR} LTS or newer (see .nvmrc).`,
    })
  } else {
    checks.push({ name: 'Node.js', status: 'ok', detail: env.nodeVersion })
  }

  // Package manager.
  if (!env.packageManager) {
    checks.push({
      name: 'Package manager',
      status: 'warn',
      detail: 'none detected',
      fix: `Enable pnpm via Corepack: \`corepack enable\`. If Windows blocks Corepack shims, use \`${PNPM_EXEC_FALLBACK}\`.`,
    })
  } else if (env.packageManager.name !== 'pnpm') {
    checks.push({
      name: 'Package manager',
      status: 'warn',
      detail: `${env.packageManager.name} ${env.packageManager.version}`,
      fix: `MindeesNative uses pnpm. Enable it via Corepack: \`corepack enable\`. If Windows blocks Corepack shims, use \`${PNPM_EXEC_FALLBACK}\`.`,
    })
  } else {
    checks.push({
      name: 'Package manager',
      status: 'ok',
      detail: `pnpm ${env.packageManager.version}`,
    })
  }

  // Project presence.
  if (!env.hasPackageJson) {
    checks.push({
      name: 'Project',
      status: 'warn',
      detail: 'no package.json in this directory',
      fix: 'Run `mindees create <name>` to scaffold a new app, or cd into a project.',
    })
  } else if (!env.hasNodeModules) {
    checks.push({
      name: 'Dependencies',
      status: 'warn',
      detail: 'node_modules missing',
      fix: `Install dependencies: \`pnpm install\` (or \`${PNPM_EXEC_FALLBACK} install\` if the pnpm shim is unavailable).`,
    })
  } else {
    checks.push({ name: 'Project', status: 'ok', detail: 'package.json + node_modules present' })
  }

  return checks
}

/** Overall status: `fail` if any check failed, else `warn` if any warned, else `ok`. */
export function doctorSummary(checks: readonly DoctorCheck[]): 'ok' | 'warn' | 'fail' {
  if (checks.some((c) => c.status === 'fail')) return 'fail'
  if (checks.some((c) => c.status === 'warn')) return 'warn'
  return 'ok'
}

/** Render checks as human-readable lines (for the `doctor` command output). */
export function renderDoctor(checks: readonly DoctorCheck[]): string[] {
  const icon = { ok: '✓', warn: '!', fail: '✗' } as const
  const lines: string[] = []
  for (const c of checks) {
    lines.push(`${icon[c.status]} ${c.name}: ${c.detail}`)
    if (c.fix && c.status !== 'ok') lines.push(`    → ${c.fix}`)
  }
  return lines
}
