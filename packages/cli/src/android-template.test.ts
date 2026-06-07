import { describe, expect, it } from 'vitest'
import { createMemoryFileSystem } from './fs'
import { scaffold } from './scaffold'
import { getTemplate, templateNames } from './templates'
import { VERSION } from './version'

describe('android template', () => {
  const t = getTemplate('android')

  it('is registered and marked experimental', () => {
    expect(templateNames()).toContain('android')
    expect(t).toBeDefined()
    expect(t?.description.toLowerCase()).toContain('experimental')
  })

  it('vendors the native host Kotlin source + the gradle project', () => {
    const f = t?.files ?? {}
    expect(f['settings.gradle.kts']).toBeTruthy()
    expect(f['mindees-host/build.gradle.kts']).toBeTruthy()
    expect(f['mindees-host/src/main/kotlin/dev/mindees/host/AndroidViewRenderer.kt']).toContain(
      'class AndroidViewRenderer',
    )
    expect(f['mindees-host/src/main/kotlin/dev/mindees/host/MindeesNativeHost.kt']).toBeTruthy()
    expect(f['mindees-example-app/src/main/kotlin/dev/mindees/example/MainActivity.kt']).toContain(
      'class MainActivity',
    )
  })

  it('synthesizes a standalone app-js package.json pinned to the CLI version (npm, not workspace)', () => {
    const pkg = JSON.parse(t?.files['mindees-example-app/app-js/package.json'] ?? '{}')
    for (const dep of [
      '@mindees/core',
      '@mindees/atlas',
      '@mindees/renderer',
      '@mindees/router',
      '@mindees/compiler',
    ]) {
      expect(pkg.dependencies[dep]).toBe(VERSION)
    }
    expect(JSON.stringify(pkg)).not.toContain('workspace:') // must resolve from npm
    expect(pkg.scripts.build).toContain('tsdown')
  })

  it('rewrites the app-js build glue to resolve @mindees/* from npm (not the monorepo)', () => {
    const tsdown = t?.files['mindees-example-app/app-js/tsdown.config.ts'] ?? ''
    expect(tsdown).not.toContain('repoRoot') // no monorepo-relative resolution
    expect(tsdown).not.toContain('alias')
    expect(tsdown).toContain("globalName: 'MindeesAppBundle'")
    const genRoutes = t?.files['mindees-example-app/app-js/scripts/gen-routes.mjs'] ?? ''
    expect(genRoutes).toContain("from '@mindees/compiler'") // bare specifier, not a dist path
    expect(genRoutes).not.toContain('repoRoot')
  })

  it('omits host tests + the built bundle, and git-ignores the generated bundle', () => {
    const f = t?.files ?? {}
    for (const path of Object.keys(f)) {
      expect(path).not.toMatch(/\/src\/(test|androidTest)\//)
    }
    expect(f['mindees-example-app/src/main/assets/mindees-app.bundle.js']).toBeUndefined()
    expect(f['.gitignore']).toContain('mindees-app.bundle.js')
  })

  it('scaffolds the full multi-module tree into the target dir (no bundle)', () => {
    const fs = createMemoryFileSystem()
    const result = scaffold(fs, { appName: 'my-droid', targetDir: 'out', template: 'android' })
    expect(result.ok).toBe(true)
    expect(result.template).toBe('android')
    const snap = fs.snapshot()
    expect(
      snap['out/mindees-host/src/main/kotlin/dev/mindees/host/AndroidViewRenderer.kt'],
    ).toBeTruthy()
    expect(snap['out/mindees-example-app/app-js/package.json']).toBeTruthy()
    expect(snap['out/settings.gradle.kts']).toBeTruthy()
    // the built bundle is never scaffolded — the user generates it via the app-js build
    expect(snap['out/mindees-example-app/src/main/assets/mindees-app.bundle.js']).toBeUndefined()
  })

  it('parameterizes applicationId + rootProject.name per app (install coexistence)', () => {
    const fs = createMemoryFileSystem()
    scaffold(fs, { appName: 'my-droid', targetDir: 'out', template: 'android' })
    const snap = fs.snapshot()
    const gradle = snap['out/mindees-example-app/build.gradle.kts'] ?? ''
    expect(gradle).toContain('applicationId = "com.example.mydroid"') // unique install id per app
    expect(gradle).toContain('namespace = "dev.mindees.example"') // compile package stays
    expect(snap['out/settings.gradle.kts']).toContain('rootProject.name = "my-droid"')
    // no unsubstituted placeholders leak through
    for (const contents of Object.values(snap)) {
      expect(contents).not.toContain('{{androidAppId}}')
      expect(contents).not.toContain('{{appName}}')
    }
  })
})
