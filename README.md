<div align="center">

<img src="./mindees-logo.png" alt="MindeesNative — open-source TypeScript cross-platform app framework (React Native & Flutter alternative)" width="140" height="140" />

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
> of truth for what's real today versus what's still planned. **Phase 1 (the
> reactive core) is done and tested** — see the live example below.
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

## 📦 Packages

Everything ships under the [`@mindees`](https://www.npmjs.com/org/mindees) npm
scope and shares **one locked version line** (atomic, dependency-hell-free
upgrades).

| Package | Codename | Purpose | Status |
| --- | --- | --- | --- |
| [`@mindees/core`](./packages/core) | — | Reactivity (signals) + component model + scheduler + threading | 🧪 Experimental |
| `@mindees/compiler` | MDC | Build-time optimizer & codegen | 🚧 Scaffold |
| `@mindees/cli` | Forge | `mindees` CLI: create / dev / build / deploy | 🚧 Scaffold |
| `@mindees/router` | Quantum | Typed, data-aware router | 🚧 Scaffold |
| `@mindees/renderer` | Helix | Native + GPU-canvas renderer | 🚧 Scaffold |
| `@mindees/atlas` | Atlas | Batteries-included component library | 🚧 Scaffold |
| `@mindees/ai` | Synapse | On-device + dev-time intelligence | 🚧 Scaffold |
| `@mindees/data` | Continuum | Local-first store & sync | 🚧 Scaffold |
| `@mindees/updates` | Pulse | Signed differential OTA + SDUI | 🚧 Scaffold |
| `create-mindees` | — | Project scaffolder | 🚧 Scaffold |

> 🧪 **Experimental** = implemented & tested, API may still change before `1.0`.
> 🚧 **Scaffold** = exists and builds, but exports only package metadata, the
> `Maturity`/`PackageInfo` status types, and the `NotImplementedError` /
> `notImplemented` utilities. Real functionality lands in its phase — see
> [ROADMAP.md](./ROADMAP.md).

## 🗺️ Roadmap at a glance

- ✅ **Phase 0** — Monorepo, governance, verified toolchain, green CI
- ✅ **Phase 1** — `@mindees/core`: fine-grained signals & reactivity
- ✅ **Phase 2** — Component model, selector-isolated context, priority scheduler & threading
- ⏭️ **Phase 3** — Helix renderer: web/DOM target + native backend contract
- ⏭️ **Phases 4–12** — Compiler, CLI, Quantum Router, OTA, local-first data,
  on-device AI, Atlas UI, examples & release

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
Not yet — it's pre-alpha. The reactive core works now; the renderer, CLI, and UI
land in upcoming phases. ⭐ Star and watch the repo to follow progress.

**Is it open source?**
Yes — dual-licensed **MIT OR Apache-2.0**, built fully in the open.

## 📄 License

Dual-licensed under **MIT OR Apache-2.0** — see [LICENSE](./LICENSE).

`SPDX-License-Identifier: MIT OR Apache-2.0`

---

<div align="center">

**MindeesNative** — write TypeScript once, run native everywhere.
Built in the open at [github.com/mindees/mindees](https://github.com/mindees/mindees) · [@mindees on npm](https://www.npmjs.com/org/mindees)

⭐ Star us on GitHub if you believe cross-platform development should be simple, fast, and honest.

</div>
