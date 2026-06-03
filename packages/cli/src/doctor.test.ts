import { describe, expect, it } from 'vitest'
import { doctorSummary, renderDoctor, runDoctor } from './doctor'
import type { EnvProbe } from './types'

const healthy: EnvProbe = {
  nodeVersion: 'v24.7.0',
  packageManager: { name: 'pnpm', version: '11.5.0' },
  hasPackageJson: true,
  hasNodeModules: true,
}

describe('runDoctor', () => {
  it('reports all-ok for a healthy environment', () => {
    const checks = runDoctor(healthy)
    expect(checks.every((c) => c.status === 'ok')).toBe(true)
    expect(doctorSummary(checks)).toBe('ok')
  })

  it('fails on an old Node version with a fix', () => {
    const checks = runDoctor({ ...healthy, nodeVersion: 'v18.0.0' })
    const node = checks.find((c) => c.name === 'Node.js')
    expect(node?.status).toBe('fail')
    expect(node?.fix).toMatch(/Upgrade/)
    expect(doctorSummary(checks)).toBe('fail')
  })

  it('warns when the package manager is not pnpm', () => {
    const checks = runDoctor({ ...healthy, packageManager: { name: 'npm', version: '11' } })
    const pm = checks.find((c) => c.name === 'Package manager')
    expect(pm?.status).toBe('warn')
    expect(pm?.fix).toMatch(/corepack/i)
    expect(pm?.fix).toContain('npm exec --yes --package=pnpm@11.5.0 -- pnpm')
  })

  it('warns when no package manager is detected', () => {
    const checks = runDoctor({ ...healthy, packageManager: null })
    const pm = checks.find((c) => c.name === 'Package manager')
    expect(pm?.status).toBe('warn')
    expect(pm?.fix).toContain('npm exec --yes --package=pnpm@11.5.0 -- pnpm')
  })

  it('warns when not inside a project', () => {
    const checks = runDoctor({ ...healthy, hasPackageJson: false })
    const proj = checks.find((c) => c.name === 'Project')
    expect(proj?.status).toBe('warn')
    expect(proj?.fix).toMatch(/mindees create/)
  })

  it('warns when dependencies are not installed', () => {
    const checks = runDoctor({ ...healthy, hasNodeModules: false })
    const deps = checks.find((c) => c.name === 'Dependencies')
    expect(deps?.status).toBe('warn')
    expect(deps?.fix).toMatch(/pnpm install/)
    expect(deps?.fix).toContain('npm exec --yes --package=pnpm@11.5.0 -- pnpm install')
  })

  it('handles an unrecognized Node version string', () => {
    const checks = runDoctor({ ...healthy, nodeVersion: 'weird' })
    expect(checks.find((c) => c.name === 'Node.js')?.status).toBe('warn')
  })
})

describe('renderDoctor', () => {
  it('renders icons and fixes', () => {
    const lines = renderDoctor(runDoctor({ ...healthy, hasNodeModules: false }))
    expect(lines.some((l) => l.startsWith('✓'))).toBe(true)
    expect(lines.some((l) => l.startsWith('!'))).toBe(true)
    expect(lines.some((l) => l.includes('→'))).toBe(true)
  })
})
