/**
 * Project templates for `mindees create` / `create-mindees`.
 *
 * Templates are in-memory maps of relative path → file contents, so they're
 * deterministic and need no on-disk fixtures. Each scaffolds a runnable
 * MindeesNative app skeleton wired to the current `@mindees/*` packages.
 *
 * @module
 */

import { ANDROID_TEMPLATE_FILES } from './android-template.generated'
import { VERSION } from './version'

/** A template: a name, a description, and its files (relative path → contents). */
export interface Template {
  name: string
  description: string
  files: Record<string, string>
}

/**
 * Version pinned for scaffolded apps. Derives from the CLI's own
 * {@link VERSION} (the single locked `@mindees/*` version line) so generated
 * projects always pin the framework packages to the same release that
 * scaffolded them, instead of a hardcoded literal.
 */
const PKG_VERSION = VERSION

function appPackageJson(appName: string, extraDeps: Record<string, string> = {}): string {
  const deps = {
    '@mindees/core': PKG_VERSION,
    '@mindees/renderer': PKG_VERSION,
    ...extraDeps,
  }
  // The `dev`/`build` scripts invoke the `mindees` binary, so the CLI must be a
  // (dev) dependency of the generated app — otherwise the commands only resolve
  // when the CLI happens to be installed globally.
  const devDeps = {
    '@mindees/cli': PKG_VERSION,
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
      devDependencies: devDeps,
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

/**
 * The `app` template: a polished starter showing the batteries — Atlas components,
 * a standard hook, and theming — so an ordinary developer has a real screen in seconds.
 */
const app: Template = {
  name: 'app',
  description: 'A polished starter — Atlas components, hooks, and theming (batteries included).',
  files: {
    'package.json': appPackageJson('{{appName}}', { '@mindees/atlas': PKG_VERSION }),
    '.gitignore': GITIGNORE,
    'tsconfig.json': TSCONFIG,
    'README.md': `# {{appName}}\n\nA MindeesNative app using the Atlas UI kit. Run \`mindees dev\`.\n`,
    'src/App.tsx': `import { createElement } from '@mindees/core'
import { Button, Card, Switch, Text, useToggle } from '@mindees/atlas'

export function App() {
  const dark = useToggle(false)
  return (
    <Card style={{ gap: 12, maxWidth: 360 }}>
      <Text style={{ fontSize: 24, fontWeight: 700 }}>Welcome to {{appName}} ✨</Text>
      <Text>Signals, native UI, and batteries included — from one TypeScript codebase.</Text>
      <Switch value={dark.value} onValueChange={dark.set} />
      <Button title="Get started" onPress={() => console.log('Let us build!')} />
    </Card>
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
/**
 * The `android` template (EXPERIMENTAL): a standalone native Android app you build with
 * `gradle assembleDebug`. The UI is TSX (Atlas + the Quantum router) running on a real
 * Android view tree via an embedded QuickJS runtime; the native host is vendored as
 * Kotlin source (no Maven dependency on MindeesNative). Files are codegen'd from the
 * CI-verified reference host (see scripts/gen-android-template.mjs), so they can't drift.
 * Unlike the web templates this carries no root package.json/tsconfig — the app-js build
 * lives under `mindees-example-app/app-js/`. See the scaffolded README for the build flow.
 */
const android: Template = {
  name: 'android',
  description:
    'EXPERIMENTAL — a standalone native Android app (gradle assembleDebug; QuickJS-hosted, host vendored as source).',
  files: ANDROID_TEMPLATE_FILES,
}

export const TEMPLATES: Record<string, Template> = {
  blank,
  counter,
  app,
  android,
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
 * A valid Android `applicationId` derived from the app name (reverse-DNS, sanitized to a Java
 * identifier segment). Gives each scaffold a unique install id so two MindeesNative Android apps
 * coexist on a device. The `com.example.*` prefix is a conventional placeholder users can change.
 */
function androidAppId(appName: string): string {
  let segment = appName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (segment.length === 0) segment = 'app'
  if (/^[0-9]/.test(segment)) segment = `app${segment}`
  return `com.example.${segment}`
}

/**
 * Materialize a template's files for `appName`: substitutes the `{{appName}}` and
 * `{{androidAppId}}` placeholders and returns a fresh path → contents map. Pure (no I/O).
 * Placeholders a template doesn't use are simply no-ops.
 */
export function materialize(template: Template, appName: string): Record<string, string> {
  const appId = androidAppId(appName)
  const out: Record<string, string> = {}
  for (const [path, contents] of Object.entries(template.files)) {
    out[path] = contents.replaceAll('{{appName}}', appName).replaceAll('{{androidAppId}}', appId)
  }
  return out
}
