# Getting started

Zero to a running MindeesNative app on the web in about a minute, then the core model.

## 1. Create a project

```sh
npm create mindees@latest my-app
# or choose a template: npm create mindees@latest my-app -- --template counter
cd my-app
npm install
```

Templates: `blank` (one screen), `counter` (signals + events), `atlas` (the UI kit + live device hooks).
Every `@mindees/*` dependency is pinned to one locked version line.

## 2. Run it

```sh
npx mindees dev
```

This compiles `src/`, serves the app at `http://localhost:3000` (set `MINDEES_DEV_PORT` to change it), and
live-reloads on every save. A build error shows a diagnostics overlay that clears itself on the next good
build. The published `@mindees/*` packages load from a CDN via a native import-map — no bundler step.

To produce a static, deployable build:

```sh
npx mindees build   # → dist/ (index.html + ES modules)
```

## 3. The model

**Signals** are the single source of reactive state. Reading a signal inside a view subscribes only that
spot; writing it re-runs only the readers — no virtual DOM, no re-render of the component.

```tsx
import { signal } from '@mindees/core'

export function Counter() {
  const count = signal(0)
  return (
    <view>
      <text>{() => `Count: ${count()}`}</text>
      <button onClick={() => count.set(count() + 1)}>+1</button>
    </view>
  )
}
```

- **Components** are plain functions returning JSX. They run **once** to build the reactive graph; updates
  flow through signals, not re-invocation.
- **JSX is automatic** — you do not import `createElement`. The scaffold's `tsconfig` sets
  `jsx: "react-jsx"` + `jsxImportSource: "@mindees/core"`, so the editor, the compiler, and the docs agree.
- A child that should update over time is a **function** (`{() => ...}`); a static child is a plain value.

**Mounting** (already wired in `src/main.tsx`):

```tsx
import { createDomBackend, render } from '@mindees/renderer'
import { App } from './App'

const root = document.getElementById('app')
if (root) render(App, {}, createDomBackend(), root)
```

## 4. UI kit + theming (Atlas)

`@mindees/atlas` ships accessible components (`Button`, `Card`, `Switch`, `Text`, …), forms, gestures, a
virtualized `List` (`@mindees/atlas/list`), and design-token theming:

```tsx
import { Button, Card, Text, useTheme } from '@mindees/atlas'

export function App() {
  const theme = useTheme() // reactive; tracks the OS color scheme (dark mode)
  return (
    <Card>
      <Text style={() => ({ color: theme().color.text })}>Hello</Text>
      <Button title="Go" onPress={() => console.log('go')} />
    </Card>
  )
}
```

Call `connectWebEnvironment()` once at startup (the `atlas` template does this) to make the device hooks
(`useColorScheme`, `useWindowDimensions`, `useSafeAreaInsets`, `useKeyboard`, `useReducedMotion`) live on web.

## 5. File-based routing

Scaffold the routed starter (`npm create mindees@latest my-app -- --template router`), or add a
**`src/app/`** directory to any project — every file under it becomes a route, Expo Router-style:

| File | Route |
| --- | --- |
| `src/app/index.tsx` | `/` |
| `src/app/about.tsx` | `/about` |
| `src/app/blog/[slug].tsx` | `/blog/:slug` (dynamic param) |
| `src/app/blog/[...rest].tsx` | catch-all |
| `src/app/_layout.tsx` | layout wrapping the directory (render its `children` outlet) |
| `src/app/(group)/…` | a group that doesn't affect the URL |

Each screen is the file's `default` export and receives `RouteComponentProps` (`router`, reactive
`params`/`search`, `data`); named exports (`loader`, `searchSchema`, …) configure the route. Wire it up once:

```tsx
import { createBrowserHistory, createFileRouter, createRouterView } from '@mindees/router'
import { createDomBackend, render } from '@mindees/renderer'
import { routes } from './routes.gen.js'

const router = createFileRouter(routes, { history: createBrowserHistory() })
render(() => createRouterView(router), {}, createDomBackend(), document.getElementById('app'))
```

`mindees dev`/`build` regenerate **`src/routes.gen.ts`** — a static-import module map (the browser has no
bundler `import.meta.glob`) — and compile it to `dist/routes.gen.js`. It's git-ignored; just run `mindees dev`.

## 6. Configuration

`mindees.config.json` (optional, at the project root):

```json
{
  "perf": true,
  "budget": { "maxElements": 1500 },
  "appName": "My App"
}
```

- **`perf`** — build-time perf-lint (on by default). Warnings only; e.g. a bare `.map()` in JSX that
  re-mounts every row. Set `false` to silence.
- **`budget`** — an enforced per-module performance budget. A violation is an **error** that fails the build.
- **`appName`** — the title for the generated `index.html`.

## Where next

- Package guides: [`@mindees/core`](../packages/core), [`@mindees/renderer`](../packages/renderer),
  [`@mindees/router`](../packages/router), [`@mindees/atlas`](../packages/atlas).
- Architecture decisions: [`docs/adr`](./adr).
