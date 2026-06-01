/**
 * Project templates for `mindees create` / `create-mindees`.
 *
 * Templates are in-memory maps of relative path → file contents, so they're
 * deterministic and need no on-disk fixtures. Each scaffolds a runnable
 * MindeesNative app skeleton wired to the current `@mindees/*` packages.
 *
 * @module
 */

/** A template: a name, a description, and its files (relative path → contents). */
export interface Template {
  name: string
  description: string
  files: Record<string, string>
}

const PKG_VERSION = '0.0.0'

function appPackageJson(appName: string, extraDeps: Record<string, string> = {}): string {
  const deps = {
    '@mindees/core': PKG_VERSION,
    '@mindees/renderer': PKG_VERSION,
    ...extraDeps,
  }
  return `${JSON.stringify(
    {
      name: appName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'mindees dev',
        build: 'mindees build',
      },
      dependencies: deps,
    },
    null,
    2,
  )}\n`
}

const GITIGNORE = 'node_modules/\ndist/\n*.log\n'

const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      target: 'es2023',
      jsx: 'react',
      jsxFactory: 'createElement',
      jsxFragmentFactory: 'Fragment',
      verbatimModuleSyntax: true,
    },
    include: ['src'],
  },
  null,
  2,
)}\n`

/** The `blank` template: the minimal runnable app. */
const blank: Template = {
  name: 'blank',
  description: 'A minimal MindeesNative app (one screen).',
  files: {
    'package.json': appPackageJson('{{appName}}'),
    '.gitignore': GITIGNORE,
    'tsconfig.json': TSCONFIG,
    'README.md': `# {{appName}}\n\nA MindeesNative app. Start with \`mindees dev\`.\n`,
    'src/App.tsx': `import { createElement } from '@mindees/core'

export function App() {
  return (
    <view>
      <text>Hello from {{appName}} 👋</text>
    </view>
  )
}
`,
    'src/main.tsx': `import { createDomBackend, render } from '@mindees/renderer'
import { App } from './App'

const root = document.getElementById('app')
if (root) render(App, {}, createDomBackend(), root)
`,
  },
}

/** The `counter` template: shows fine-grained reactivity (signals). */
const counter: Template = {
  name: 'counter',
  description: 'A reactive counter — demonstrates signals + fine-grained updates.',
  files: {
    'package.json': appPackageJson('{{appName}}'),
    '.gitignore': GITIGNORE,
    'tsconfig.json': TSCONFIG,
    'README.md': `# {{appName}}\n\nA reactive counter built with MindeesNative signals.\n`,
    'src/App.tsx': `import { createElement, signal } from '@mindees/core'

export function App() {
  const count = signal(0)
  return (
    <view>
      <text>{() => \`Count: \${count()}\`}</text>
      <button onClick={() => count.set(count() + 1)}>Increment</button>
    </view>
  )
}
`,
    'src/main.tsx': `import { createDomBackend, render } from '@mindees/renderer'
import { App } from './App'

const root = document.getElementById('app')
if (root) render(App, {}, createDomBackend(), root)
`,
  },
}

/** All built-in templates, keyed by name. */
export const TEMPLATES: Record<string, Template> = {
  blank,
  counter,
}

/** The default template name used when none is specified. */
export const DEFAULT_TEMPLATE = 'blank'

/** Look up a template by name, or `undefined` if unknown. */
export function getTemplate(name: string): Template | undefined {
  return TEMPLATES[name]
}

/** Names of all available templates. */
export function templateNames(): string[] {
  return Object.keys(TEMPLATES)
}

/**
 * Materialize a template's files for `appName`: substitutes the `{{appName}}`
 * placeholder and returns a fresh path → contents map. Pure (no I/O).
 */
export function materialize(template: Template, appName: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, contents] of Object.entries(template.files)) {
    out[path] = contents.replaceAll('{{appName}}', appName)
  }
  return out
}
