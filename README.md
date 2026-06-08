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
[![Status: v0.30.2 experimental](https://img.shields.io/badge/status-v0.30.2%20experimental-orange.svg)](./STATUS.md)
[![npm](https://img.shields.io/badge/npm-%40mindees%2F*-cb3837.svg)](https://www.npmjs.com/org/mindees)

[Status](./STATUS.md) · [Roadmap](./ROADMAP.md) · [Contributing](./CONTRIBUTING.md) · [RFCs](./rfcs/README.md) · [Discussions](https://github.com/mindees/mindees/discussions)

</div>

---

> ### ⚠️ v0.30.2 — experimental, building in the open (all 10 packages on npm)
>
> MindeesNative is **not production-ready yet** — we are building it in public and
> follow one rule above all: **everything we ship actually works.**
> [`STATUS.md`](./STATUS.md) is the honest, per-package source of truth.
>
> **The headline, real and CI-verified today: the *same* TypeScript app renders and is
> interactive on web, Android, and iOS.** The Helix renderer drives a web/DOM target
> (with real SSR), a real **Android** view tree (flex via FlexboxLayout, scrolling,
> text, images, text inputs, elevation), and a real **iOS** UIKit tree
> (UIStackView/Auto-Layout, scrolling, text, images, inputs) — and native **events
> carry values**, so `onChangeText` delivers the typed text. Each is proven every PR on
> a real **Android emulator** (Robolectric + QuickJS bridge) and a real **iOS Simulator**
> (XCTest + JavaScriptCore bridge), no local Mac required.
>
> **The rest, real and tested:** fine-grained + **concurrent** reactivity, an
> **animation engine** + **gesture system**, the typed **router** with an animated stack
> navigator, the compiler with an opt-in **perf-lint** and **enforced perf budgets**, the
> Helix **Canvas strand** (2D scene graph, WebGPU-ready), and a batteries-included
> **Atlas** kit — **27+ components** (incl. Tabs, Accordion, Stepper, SegmentedControl,
> Toast, Modal), **12+ hooks** (incl. `useForm`, `usePersistentSignal`, debounce/interval),
> and theming. **Pulse** ships signed OTA + WASM modules + server-driven UI; **Continuum**
> ships local-first CRDTs (LWW, OR-set, PN-counter, version vectors) + sync; **Synapse** is
> the AI layer. **Still missing:** physical-device proof, a *published* native host library
> (Maven/SPM), app-store packaging, and production hardening — so end-to-end production
> native apps are not ready yet. We benchmark against the **latest stable React Native
> (0.85) and Flutter (3.44)**.
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
a **native command backend** (compiles the tree + reactive updates into a
serializable native command stream — Phase 8A), and the Helix **Canvas strand**
(`createCanvas2DBackend`, a WebGPU-ready 2D scene graph) all ship today. The
iOS/Android host projects in [`examples/native-hosts/`](./examples/native-hosts/)
now run the *same* app end-to-end through embedded JS engines — **QuickJS** on a
real Android emulator and **JavaScriptCore** on a real iOS Simulator (Phase 8F),
each render-verified every PR in CI. The remaining native gap is physical-device
proof + a published host library, and the GPU-accelerated WebGPU canvas backend
(`createCanvasBackend`) remains a research track.

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

### 🎬 Animations & gestures as signals — no worklet runtime to learn

An `AnimatedValue` **is a signal**, so reading it in a `style` re-renders only that
node — no separate animation API, no Reanimated worklet mental model. Gestures are
signals too, and a flick hands its velocity to a spring:

```ts
import { animate, timing, spring, pan } from '@mindees/core'

const x = animate(0)
timing(x, { to: 100, duration: 250 })          // tween
spring(x, { to: 0, stiffness: 170 })           // physics, velocity-aware

// drag → spring-on-release, all reactive:
const drag = pan({ axis: 'x', onUpdate: (e) => x.set(e.translationX) })
```

One injected frame source drives every animation in **one batch per frame**
(glitch-free), and the loop **sleeps when nothing is animating** (zero idle cost).
On a native host it's wired to **vsync automatically** — smooth by default. Atlas
adds an **animated stack navigator** (slide/fade + edge **swipe-back**) and
`tap`/`longPress`/`pan`/`pinch`/`swipe` recognizers.

### 🔋 Batteries RN & Flutter make you install a library for — built in

```ts
import { useForm, useToggle, useAsync, Checkbox } from '@mindees/atlas'

const form = useForm({
  initialValues: { email: '' },
  schema: z.object({ email: z.string().email() }),   // any Standard Schema
  onSubmit: (values) => save(values),
})
form.field('email').error()   // reactive, per-field — re-renders only this field
```

`useForm` (Standard-Schema validation), `useToggle`/`useCounter`/`usePrevious`/
`useReducer`/`useAsync`/`usePersistentSignal`/`useDebounce`/`useInterval`/`useTimeout`,
plus **27+ accessible components** (`Checkbox`, `RadioGroup`, `Switch`, `Skeleton`,
`Tabs`, `Accordion`, `Stepper`, `SegmentedControl`, `Toast`, `Modal`, virtualized
`List`, …) and **design-token theming** with automatic dark mode. And an opt-in
**compiler perf-lint** — plus **enforced perf budgets** that fail the build when a
hot path blows its budget — warns you when code will jank, something neither React
Native nor Flutter ships.

## 📦 Packages

Everything ships under the [`@mindees`](https://www.npmjs.com/org/mindees) npm
scope and shares **one locked version line** (atomic, dependency-hell-free
upgrades).

| Package | Codename | Purpose | Status |
| --- | --- | --- | --- |
| [`@mindees/core`](./packages/core) | — | Reactivity (signals) + component model + scheduler + threading | 🧪 Experimental |
| [`@mindees/compiler`](./packages/compiler) | MDC | Build-time optimizer: type-check gate + TSX transform + tree-flatten + route manifest + perf-lint + enforced perf budgets (TS→native AOT 🔬) | 🧪 Experimental |
| [`@mindees/cli`](./packages/cli) | Forge | `mindees` CLI: create / build / doctor / info / dev | 🧪 Experimental |
| [`@mindees/router`](./packages/router) | Quantum | Typed router: codegen-free typed params + Standard-Schema search + signals-native state + nested rendering | 🧪 Experimental |
| [`@mindees/renderer`](./packages/renderer) | Helix | Reactive renderer: web/DOM + SSR/hydration + native command backend + Canvas strand (2D scene graph) + the *same* app render-verified on a real Android emulator (QuickJS) & iOS Simulator (JavaScriptCore) in CI; GPU/WebGPU canvas 🔬 | 🧪 Experimental |
| [`@mindees/atlas`](./packages/atlas) | Atlas | 27+ accessible, signals-native components (View/Text/Image/TextInput/Pressable/Button + Card/Switch/Badge/Avatar/Chip/Tabs/Accordion/Stepper/SegmentedControl/Toast/Modal/…) + 12+ hooks, layout, cross-platform `StyleObject`, `role`/`aria-*` a11y, design-token theming + dark mode, and a virtualized recycling `List`; web real, native render-verified in CI | 🧪 Experimental |
| [`@mindees/ai`](./packages/ai) | Synapse | Provider-agnostic AI: pure-TS contract + mock & inject-`fetch` server backends, `AsyncIterable` streaming, Standard-Schema structured output (`generateObject`/`streamObject`), bounded tool calling (`runTools`), and a dev-time error explainer; on-device runtime 🔬 | 🧪 Experimental |
| [`@mindees/data`](./packages/data) | Continuum | Local-first: signals-native `createCollection` + HLC causality + CRDT merge (LWW + OR-Set + PN-Counter + MV-register) + version vectors + delta-sync engine + reference sync server + memory/web-storage persistence export/restore | 🧪 Experimental |
| [`@mindees/updates`](./packages/updates) | Pulse | Signed OTA: hash-addressed manifest + Ed25519 signing (threshold/rotation) + content-addressed store + atomic rollback + **differential (delta) downloads** + **reference update server** + **server-driven UI (SDUI)** + a **sandboxed WASM module runtime** | 🧪 Experimental |
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
- ✅ **Phase 8F-A/B** — Android embedded-runtime example app: QuickJS + JS↔native command bridge, APK assembly, and an emulator-connected render/interaction test in CI (`native-android.yml`)
- ✅ **Phase 8F-C** — iOS embedded-runtime bridge: JavaScriptCore + JS↔native command bridge, model bridge tests, and an iOS Simulator XCTest with value-carrying events in CI (`native-ios.yml`)
- ✅ **Phase 9A** — Pulse **signed OTA core**: hash-addressed manifest + Ed25519 signing/verify (threshold + key rotation, pure-JS `@noble`) + content-addressed store + an update client with atomic generations & crash-loop rollback
- ✅ **Phase 9B** — Pulse **differential downloads**: a zero-dep pure-TS byte-level delta codec (`diff`/`applyDelta`) so a changed asset ships as just its delta against a stored base, verified by the existing SHA-256 gate with a full-fetch fallback
- ✅ **Phase 9C** — Pulse **reference update server**: a pure, capability-injected `createUpdateServer` (channel selection, staged rollout, anti-downgrade, freeze, rollback directives, content-addressed asset serving; never signs) + a runnable `node:http` adapter example
- ✅ **Phase 9D** — Pulse **server-driven UI (SDUI)**: `compileSdui` turns an allowlisted JSON tree into a reactive `MindeesNode` (named actions + `$bind` bindings, no `eval`, prototype-pollution-safe) + RFC 7396 / safe RFC 6902 patches — **Phase 9 (Pulse) complete**
- ✅ **Phase 10 (Continuum)** — **local-first data**: signals-native `createCollection` (10A) + Hybrid Logical Clock causality (10B) + CRDT conflict resolution — per-field LWW + add-wins OR-Set (10C) + a **delta-sync engine where two peers converge offline** (10D) + reference sync server and persistence export/restore (10E/10F)
- ✅ **Phase 11 (Synapse) — provider-agnostic AI**: a pure-TS `AiBackend` (`createAi`) with a deterministic mock + an inject-`fetch` server backend (openai/anthropic), `AsyncIterable` streaming (11A/11B); Standard-Schema **structured output** (`generateObject`/`streamObject`, no `eval`, sanitize-before-validate) + a bounded **tool-calling loop** (`runTools`) (11C); and a dev-time **error explainer** (`mindees ai explain`) (11D) — on-device LLM inference is a labeled 🔬 research track
- ✅ **Phase 12 (Atlas) — accessible UI primitives + virtualized list**: signals-native `View`/`Text`/`Image`/`TextInput`/`Pressable`/`Button` + layout (`Stack`/`Row`/`Column`/`Spacer`/`ScrollView`), a curated cross-platform `StyleObject` (numbers → `px` on web), `role`/`aria-*` accessibility, real-DOM-event interaction, a structural theme (12A), and a **virtualized recycling `List`** that renders only the visible window and reuses rows as you scroll (12B) — renderer-agnostic trees, web real, native 🔬
- ⏭️ **Phase 13** — physical-device native proof + a published native host library (Maven/SPM), then app-store packaging, production hardening, benchmarks, docs site & release

Benchmark evidence for implemented hot paths lives in [`docs/benchmarks.md`](./docs/benchmarks.md).

Full plan: [ROADMAP.md](./ROADMAP.md).

## 🚀 Quickstart

Scaffold a new app, then run it — `mindees dev` serves it at `http://localhost:3000` with live-reload,
and `mindees build` emits a deployable `dist/` (packages are on npm at `0.30.2`, 🧪 experimental):

```bash
npm create mindees@latest my-app -- --template counter
cd my-app && npm install
npx mindees dev      # → http://localhost:3000 (live-reload)
# npx mindees build  # → dist/ (static, deployable)
```

See the [getting-started guide](./docs/getting-started.md) for the full walkthrough.

Or add packages to an existing project:

```bash
pnpm add @mindees/core @mindees/renderer
```

### Developing the framework (contributors)

To hack on the framework itself:

```bash
corepack enable
git clone https://github.com/mindees/mindees.git
cd mindees
pnpm install
pnpm verify   # lint + versions + typecheck + build + exports + pack + CLI smoke + test
```

If Corepack cannot create `pnpm` shims on Windows, run the same commands through
the pinned package manager without a global install:

```powershell
npm exec --yes --package=pnpm@11.5.0 -- pnpm install
npm exec --yes --package=pnpm@11.5.0 -- pnpm verify
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
experimental (`v0.30.2`) but already renders the same app interactively on web,
Android, and iOS in CI.

**Is it a Flutter alternative?**
Yes — without requiring a new language (Dart). You write TypeScript, target iOS,
Android and web, and get fine-grained reactivity and native UI.

**What language does it use?**
100% TypeScript. No new language to learn.

**Can I build mobile apps with it today?**
Not for production yet — it's experimental (`v0.30.2`). But the *same* TypeScript app
already renders **styled, laid-out, interactive UI on web, a real Android emulator,
and a real iOS Simulator** in CI — flex, scrolling, text, images, text inputs, and
events that carry values (native `onChangeText` works) — through embedded QuickJS
(Android) and JavaScriptCore (iOS) JS↔native bridges. The reactive core, compiler,
CLI, typed router, Pulse OTA, Continuum data, Synapse AI, and the Atlas UI kit all
work in their documented experimental scope. Still missing: physical-device proof, a
*published* native host library, app-store packaging, and production hardening.

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
