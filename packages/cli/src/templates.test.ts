import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE, getTemplate, TEMPLATES, templateNames } from './templates'

describe('templates', () => {
  // The web templates (blank/counter/app) are single-package JS apps rooted at the
  // project dir. The `android` template is a multi-module native project (its app-js
  // package.json/tsconfig live under mindees-example-app/app-js/), so it's exempt here
  // and covered by android-template.test.ts instead.
  const WEB_TEMPLATES = ['blank', 'counter', 'app', 'router']
  it('every web template carries a package.json, tsconfig, and a main entry', () => {
    for (const name of WEB_TEMPLATES) {
      const t = getTemplate(name)
      expect(t).toBeDefined()
      expect(t?.files['package.json']).toBeTruthy()
      expect(t?.files['tsconfig.json']).toBeTruthy()
      expect(t?.files['src/main.tsx']).toContain('render')
    }
  })

  it('exposes a valid default template', () => {
    expect(templateNames()).toContain(DEFAULT_TEMPLATE)
    expect(TEMPLATES[DEFAULT_TEMPLATE]).toBeDefined()
  })

  it('scaffolds an Atlas-based starter (`app`) that depends on @mindees/atlas', () => {
    const t = getTemplate('app')
    expect(t).toBeDefined()
    expect(templateNames()).toContain('app')
    const pkg = JSON.parse(t?.files['package.json'] ?? '{}')
    expect(pkg.dependencies['@mindees/atlas']).toBeTruthy()
    expect(t?.files['src/App.tsx']).toContain('@mindees/atlas')
    expect(t?.files['src/App.tsx']).toContain('useToggle')
  })

  it('scaffolds a file-based-routing starter (`router`) with src/app/ screens', () => {
    const t = getTemplate('router')
    expect(t).toBeDefined()
    const pkg = JSON.parse(t?.files['package.json'] ?? '{}')
    expect(pkg.dependencies['@mindees/router']).toBeTruthy()
    expect(t?.files['src/app/index.tsx']).toContain('export default')
    expect(t?.files['src/app/about.tsx']).toContain('export default')
    expect(t?.files['src/main.tsx']).toContain('createFileRouter')
    expect(t?.files['src/main.tsx']).toContain("from './routes.gen.js'")
    expect(t?.files['.gitignore']).toContain('src/routes.gen.ts') // generated → ignored
  })
})
