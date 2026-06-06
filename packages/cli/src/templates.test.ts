import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATE, getTemplate, TEMPLATES, templateNames } from './templates'

describe('templates', () => {
  it('every template carries a package.json, tsconfig, and a main entry', () => {
    for (const name of templateNames()) {
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
})
