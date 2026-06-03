<div align="center">

<img src="./mindees-native-with-text-logo.png" alt="MindeesNative — open-source TypeScript cross-platform app framework (React Native & Flutter alternative)" width="440" />

# MindeesNative

### ⚡ The open-source, TypeScript-first cross-platform app framework

**Build native iOS, Android & web apps from one TypeScript codebase.**
A modern **React Native** and **Flutter** alternative — with fine-grained
**signals** reactivity, true native UI, batteries-included tooling, and instant
OTA updates. Built in the open.

[![CI](https://github.com/mindees/mindees/actions/workflows/ci.yml/badge.svg)](https://github.com/mindees/mindees/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](./STATUS.md)

[Status](./STATUS.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md) · [RFCs](./rfcs/README.md) · [Discussions](https://github.com/mindees/mindees/discussions)

</div>

---

> ### ⚠️ Pre-alpha — building in the open
>
> MindeesNative is **not production-ready yet** — we are building it phase by
> phase, bottom-up, and we follow one rule above all: **everything we ship
> actually works.** [`STATUS.md`](./STATUS.md) is the honest, per-package source
> of truth for what's real today versus what's still planned. **The reactive
> core, renderer (with SSR), compiler, CLI, and typed router are done and
> tested** — see the live examples below. The **native rendering strand** is real:
> the command backend, a strict conformance contract, and **iOS + Android host
> projects that render the command stream into correct native view trees** are all
> verified in CI (Phases 8A–8E). The **signed OTA core** (Pulse — manifest, Ed25519
> signing, content-addressed store, atomic rollback) landed in Phase 9A. Still
> missing: native iOS/Android apps **do not run end-to-end yet** — an embedded JS
> engine + JS↔native bridge (Phase 8F) is what makes a full on-device app real.
>
> ⭐ **Star the repo** to follow along, and check the
> [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue)
> list — contributors welcome.

## Why MindeesNative? (React Native & Flutter, reimagined)

React Native and Flutter each made one foundational bet, and each created
permanent trade-offs. MindeesNative is designed to **inherit the strengths of
both while engineering away the weaknesses**:

- 🟦 **TypeScript, end to end** — the world's most popular typed language and the
  largest developer talent pool. No new niche language to learn.
- ⚛️ **Fine-grained signals reactivity** — the modern reactivity model (à la
  SolidJS): update *exactly* what changed, with no virtual-DOM diffing and no
  manual memoization. **Shipping today in [`@mindees/core`](./packages/core).**
- 📱 **Native UI by default, GPU canvas when you want it** — render real
  platform components *and* drop to a pixel-perfect GPU canvas, per subtree.
- 🔋 **Batteries included, dependencies excluded** — one cohesive,
  single-versioned SDK instead of dependency-hell roulette.
- 🚀 **Instant OTA updates** — ship fixes without waiting on app-store review.
- 🌍 **Truly universal** — one codebase targeting **iOS, Android, web & desktop**.

> We don't claim these are all done. We're building them in order, in public, and
> labeling exactly where we are. Honesty is a feature.

## ✨ Live example — fine-grained signals (works today)

```ts
import { signal, computed, effect, batch } from '@mindees/core'

const count = signal(0)
const doubled = computed(() => count() * 2)

// re-runs only when something it reads actually changes
effect(() => console.log(`count=${count()} doubled=${doubled()}`))

count.set(1)                 // → count=1 doubled=2
count.update((n) => n + 1)   // → count=2 doubled=4

batch(() => {                // coalesce writes → effect runs once
  count.set(10)
  count.set(20)
})                           // → count=20 doubled=40
```

Glitch-free, lazy, leak-free, and fully typed. See
[`@mindees/core`](./packages/core) for the full API.

### 🧩 Re-render isolation — context that only updates what changed (Phase 2)

```ts
import { createContext, createProvider } from '@mindees/core'

const Session = createContext({ user: { name: 'Ada' }, unread: 0 })
const session = createProvider(Session)

const name = session.select((s) => s.user.name)   // memo, isolated
const unread = session.select((s) => s.unread)     // memo, isolated

session.set({ user: { name: 'Ada' }, unread: 5 })  // only `unread` consumers re-run
```

No more "the whole screen re-rendered because one field changed." MindeesNative
ships a **priority scheduler** and a **Web Worker thread-pool** in the same core,
too — see [`@mindees/core`](./packages/core).

### 🖥️ Render to the DOM with real SSR — crawlable, SEO-friendly (Phase 3)

Unlike Flutter Web (which paints to a canvas search engines can't read),
MindeesNative's **Helix** renderer emits real, crawlable HTML on the server and
hydrates it into a live, fine-grained reactive tree on the client:

```ts
import { renderToString, hydrate } from '@mindees/renderer'
import { signal, createElement as h } from '@mindees/core'

function Counter() {
  const n = signal(0)
  return h('view', { onClick: () => n.set(n() + 1) }, () => `clicked ${n()}×`)
}

// Server: real HTML for SEO + fast first paint
renderToString(Counter, {})        // → '<div>clicked 0×</div>'

// Client (current preview): remount with live, fine-grained reactivity.
// Adopt-in-place hydration (no remount) is tracked as follow-up work.
hydrate(document.getElementById('app'), Counter, {})
```

One renderer, swappable **host backends**: a web/DOM backend, a headless backend,
and a **native command backend** (compiles the tree + reactive updates into a
serializable native command stream — Phase 8A) ship today; the real iOS/Android
hosts that render that stream, and a GPU canvas, are on the roadmap.

### ⚙️ A compiler that won't let type errors ship (Phase 4)

The Mindees Compiler (MDC) is built on the TypeScript Compiler API: a strict
**type-check gate**, a TSX→`createElement` transform, and **tree-flattening**
that turns static UI into create-once constants.

```ts
import { compile, compileChecked } from '@mindees/compiler'

compileChecked('const a: number = "oops"').code        // '' — build refused, type error reported
compile('export const v = <view><text>hi</text></view>').stats
// → { flattenedNodes: 1, totalElements: 2 }  ← static subtree optimized at build time
```

Zero native binaries → deterministic, reproducible builds on every OS and CI.

### 🛠️ One CLI to scaffold, build, and diagnose (Phase 5)

`create-mindees` and the `mindees` CLI (Forge) get you from zero to a running
app — and `mindees doctor` replaces cryptic failures with actionable fixes.

```bash
npm create mindees@latest my-app -- --template counter
cd my-app && pnpm install
mindees build      # type-checks + compiles your app
mindees doctor     # ✓ Node ✓ pnpm ! node_modules missing → run `pnpm install`
```

Built on Node's own `parseArgs` — zero CLI dependencies.

### 🧭 A typed router that beats Expo Router & React Router (Phases 6–7)

The **Quantum** router types your path **and** search params with **zero
codegen** — no generated type files, no dev server, no stale types. Bring any
[Standard Schema](https://standardschema.dev) validator (Zod, Valibot, ArkType)
for runtime-validated, fully-typed search params — the capability Expo Router and
React Router don't have:

```ts
import { createRouter, createBrowserHistory } from '@mindees/router'
import { z } from 'zod'

const router = createRouter({
  routes: [
    { path: '/posts/:postId' },
    { path: '/search', searchSchema: z.object({ q: z.string(), page: z.coerce.number() }) },
  ],
  history: createBrowserHistory(),
})

router.navigate({ to: '/posts/:postId', params: { postId: '42' } }) // ✓ typed; params required
// router.navigate({ to: '/posts/:postId' })                        // ✗ compile error

// Fine-grained reactive route state — re-runs ONLY when this slice changes:
const postId = router.select((s) => s.params.postId)
```

Path params are inferred straight from the pattern string
(`PathParams<'/posts/:postId'>` → `{ postId: string }`), route state is a
**signals graph** (no whole-screen re-render on navigation, no global-vs-local
hook trap), and the route table can be **reconfigured live without resetting**
where the user is.

And it **renders**: `createRouterView` draws the matched route chain with
**fine-grained, layout-preserving** nesting — switching between sibling pages
keeps the parent layout (and its state) mounted, and a same-route param change
(`/posts/1` → `/posts/2`) re-mounts *nothing*; only the bindings that read the
changed param update. Plus a typed `createLink`, **SWR data loaders** (with
`AbortSignal` cancellation, `preload` intent-prefetch, and `invalidate`),
**navigation guards** (cancel / redirect / idempotent), and **web view
transitions**. See [`@mindees/router`](./packages/router).

## 📦 Packages

Everything ships under the [`@mindees`](https://www.npmjs.com/org/mindees) npm
scope and shares **one locked version line** (atomic, dependency-hell-free
upgrades).

| Package | Codename | Purpose | Status |
| --- | --- | --- | --- |
| [`@mindees/core`](./packages/core) | — | Reactivity (signals) + component model + scheduler + threading | 🧪 Experimental |
| [`@mindees/compiler`](./packages/compiler) | MDC | Build-time optimizer: type-check gate + TSX transform + tree-flatten + route manifest | 🧪 Experimental |
| [`@mindees/cli`](./packages/cli) | Forge | `mindees` CLI: create / build / doctor / info / dev | 🧪 Experimental |
| [`@mindees/router`](./packages/router) | Quantum | Typed router: codegen-free typed params + Standard-Schema search + signals-native state + nested rendering | 🧪 Experimental |
| [`@mindees/renderer`](./packages/renderer) | Helix | Reactive renderer: web/DOM + SSR/hydration + native command backend (real iOS/Android hosts + GPU canvas 🔬) | 🧪 Experimental |
| [`@mindees/atlas`](./packages/atlas) | Atlas | Accessible, signals-native UI primitives (View/Text/Image/TextInput/Pressable/Button/Stack/Row/Column/Spacer/ScrollView) + cross-platform `StyleObject`, `role`/`aria-*` a11y, real-DOM-event interaction, and a structural theme; virtualized list next; native 🔬 | 🧪 Experimental |
| [`@mindees/ai`](./packages/ai) | Synapse | Provider-agnostic AI: pure-TS contract + mock & inject-`fetch` server backends, `AsyncIterable` streaming, Standard-Schema structured output (`generateObject`/`streamObject`), bounded tool calling (`runTools`), and a dev-time error explainer; on-device runtime 🔬 | 🧪 Experimental |
| [`@mindees/data`](./packages/data) | Continuum | Local-first: signals-native `createCollection` + HLC causality + CRDT merge (LWW + OR-Set) + a delta-sync engine where two peers converge offline | 🧪 Experimental |
| [`@mindees/updates`](./packages/updates) | Pulse | Signed OTA: hash-addressed manifest + Ed25519 signing (threshold/rotation) + content-addressed store + atomic rollback + **differential (delta) downloads** + **reference update server** + **server-driven UI (SDUI)** | 🧪 Experimental |
| [`create-mindees`](./packages/create-mindees) | — | Project scaffolder (`npm create mindees`) | 🧪 Experimental |

> 🧪 **Experimental** = implemented & tested, API may still change before `1.0`.
> 🚧 **Scaffold** = exists and builds, but exports only package metadata, the
> `Maturity`/`PackageInfo` status types, and the `NotImplementedError` /
> `notImplemented` utilities. Real functionality lands in its phase — see
> [ROADMAP.md](./ROADMAP.md).

## 🗺️ Roadmap at a glance

- ✅ **Phase 0** — Monorepo, governance, verified toolchain, green CI
- ✅ **Phase 1** — `@mindees/core`: fine-grained signals & reactivity
- ✅ **Phase 2** — Component model, selector-isolated context, priority scheduler & threading
- ✅ **Phase 3** — Helix renderer: fine-grained web/DOM backend, **SSR + hydration**, headless test backend
- ✅ **Phase 4** — Mindees Compiler (MDC): type-check gate, TSX transform, tree-flattening, route manifest
- ✅ **Phase 5** — Forge CLI + `create-mindees`: scaffold, build, doctor
- ✅ **Phase 6** — Quantum Router I: codegen-free typed params, Standard-Schema typed search, signals-native state
- ✅ **Phase 7** — Quantum Router II: nested routes + `createRouterView` (layout-preserving rendering) + typed `createLink` + SWR data loaders, navigation guards, and view transitions
- ✅ **Phase 8A** — Helix native strand: a platform-neutral native **command backend** (element tree + reactive updates → serializable command stream; events as stable handler ids)
- ✅ **Phase 8B** — native **host conformance contract**: a strict reference host (`createReferenceHost`) that replays + validates the command stream — the executable spec a real native host implements
- ✅ **Phase 8C / 8D** — **iOS & Android host projects** ([examples/native-hosts/](./examples/native-hosts/)) compile + pass their conformance cores in CI (macOS runner for iOS; Linux + Android SDK for Android)
- ✅ **Phase 8E** — both hosts **render** the command stream into correct native view trees, verified in CI (iOS Simulator XCTest; Android Robolectric, incl. click dispatch)
- ✅ **Phase 9A** — Pulse **signed OTA core**: hash-addressed manifest + Ed25519 signing/verify (threshold + key rotation, pure-JS `@noble`) + content-addressed store + an update client with atomic generations & crash-loop rollback
- ✅ **Phase 9B** — Pulse **differential downloads**: a zero-dep pure-TS byte-level delta codec (`diff`/`applyDelta`) so a changed asset ships as just its delta against a stored base, verified by the existing SHA-256 gate with a full-fetch fallback
- ✅ **Phase 9C** — Pulse **reference update server**: a pure, capability-injected `createUpdateServer` (channel selection, staged rollout, anti-downgrade, freeze, rollback directives, content-addressed asset serving; never signs) + a runnable `node:http` adapter example
- ✅ **Phase 9D** — Pulse **server-driven UI (SDUI)**: `compileSdui` turns an allowlisted JSON tree into a reactive `MindeesNode` (named actions + `$bind` bindings, no `eval`, prototype-pollution-safe) + RFC 7396 / safe RFC 6902 patches — **Phase 9 (Pulse) complete**
- ✅ **Phase 10 (core)** — Continuum **local-first data**: signals-native `createCollection` (10A) + Hybrid Logical Clock causality (10B) + CRDT conflict resolution — per-field LWW + add-wins OR-Set (10C) + a **delta-sync engine where two peers converge offline** (10D)
- ✅ **Phase 11 (Synapse) — provider-agnostic AI**: a pure-TS `AiBackend` (`createAi`) with a deterministic mock + an inject-`fetch` server backend (openai/anthropic), `AsyncIterable` streaming (11A/11B); Standard-Schema **structured output** (`generateObject`/`streamObject`, no `eval`, sanitize-before-validate) + a bounded **tool-calling loop** (`runTools`) (11C); and a dev-time **error explainer** (`mindees ai explain`) (11D) — on-device LLM inference is a labeled 🔬 research track
- ✅ **Phase 12A (Atlas) — accessible UI primitives**: signals-native `View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button` + layout (`Stack`/`Row`/`Column`/`Spacer`/`ScrollView`), a curated cross-platform `StyleObject` (numbers → `px` on web), `role`/`aria-*` accessibility, real-DOM-event interaction, and a structural theme — renderer-agnostic trees, web real, native 🔬
- ⏭️ **Phases 8F / 12B–13** — end-to-end native app (embedded JS engine + JS↔native bridge); Atlas virtualized list; then examples, benchmarks & release

Full plan: [ROADMAP.md](./ROADMAP.md).

## 🚀 Quickstart (contributors)

There's no end-user install yet — to hack on the framework:

```bash
corepack enable
git clone https://github.com/mindees/mindees.git
cd mindees
pnpm install
pnpm verify   # lint + typecheck + build + test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## 🛠️ Tech stack

TypeScript (strict) · pnpm workspaces · Turborepo · tsdown (Rolldown) · Biome ·
Vitest · Changesets · lefthook — all pinned to their latest stable releases.

## 🤝 Contributing & community

MindeesNative is built in the open and **actively wants contributors** — whether
you're into language runtimes, compilers, reactivity, mobile, or docs.

- 🌱 Start with a [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue) or [`help wanted`](https://github.com/mindees/mindees/labels/help%20wanted)
- 📐 Big ideas go through the lightweight [RFC process](./rfcs/README.md)
- 📜 Read the [Governance model](./GOVERNANCE.md) and [Code of Conduct](./CODE_OF_CONDUCT.md)
- 💬 Ask anything in [GitHub Discussions](https://github.com/mindees/mindees/discussions)

## ❓ FAQ

**Is MindeesNative a React Native alternative?**
That's the goal — a TypeScript cross-platform framework that keeps React
Native's strengths (familiar language, native UI, OTA updates) while removing
its pain points (dependency hell, single-thread limits, debugging). It's
pre-alpha today.

**Is it a Flutter alternative?**
Yes — without requiring a new language (Dart). You write TypeScript, target iOS,
Android and web, and get fine-grained reactivity and native UI.

**What language does it use?**
100% TypeScript. No new language to learn.

**Can I build mobile apps with it today?**
Not yet — it's pre-alpha. The reactive core, **web** renderer (with SSR), the
compiler, the CLI, and the typed router all work now, and the **native rendering
foundation** (a platform-neutral command backend) has landed (Phase 8A). But a
real **native (iOS/Android) host** that draws those commands to the screen — and
the Atlas UI library — land in upcoming phases, so native apps don't run
end-to-end yet. ⭐ Star and watch the repo to follow progress.

**Is it open source?**
Yes — dual-licensed **MIT OR Apache-2.0**, built fully in the open.

## 📄 License

Dual-licensed under **MIT OR Apache-2.0** — see [LICENSE](./LICENSE).

`SPDX-License-Identifier: MIT OR Apache-2.0`

---

<div align="center">

<img src="./mindees-native-logo.png" alt="MindeesNative logo" width="80" height="80" />

**MindeesNative** — write TypeScript once, run native everywhere.
Built in the open at [github.com/mindees/mindees](https://github.com/mindees/mindees) · [@mindees on npm](https://www.npmjs.com/org/mindees)

⭐ Star us on GitHub if you believe cross-platform development should be simple, fast, and honest.

</div>
