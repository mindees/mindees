<div align="center">

<img src="./mindees-logo.png" alt="MindeesNative" width="140" height="140" />

# MindeesNative

**Write TypeScript once. Aim for native everywhere. Build it honestly, in the open.**

A next-generation cross-platform app framework — designed to inherit the
strengths of React Native *and* Flutter while engineering away their forced
trade-offs.

[Status](./STATUS.md) ·
[Roadmap](./ROADMAP.md) ·
[Contributing](./CONTRIBUTING.md) ·
[RFCs](./rfcs/README.md)

</div>

---

> ### ⚠️ Pre-alpha — Phase 0 (foundations)
>
> **Nothing here is a usable framework yet.** This repository is currently the
> monorepo skeleton, the open-source governance surface, and the verified
> toolchain. We build **bottom-up**, and we follow one rule above all others:
> **everything we ship actually works.** See [STATUS.md](./STATUS.md) for an
> honest, per-package account of what exists today versus what is still a
> research track.

## Why MindeesNative

React Native and Flutter each made one foundational bet, and each bet created
permanent trade-offs. MindeesNative's thesis is to inherit each one's strengths
while engineering away the corresponding weaknesses. The short version:

- **TypeScript** — the largest developer pool, not a single-purpose language.
- **Native components by default, GPU canvas when you want it** — track the OS,
  or paint every pixel; choose per subtree.
- **Batteries included, dependencies excluded** — a cohesive, single-versioned
  first-party SDK instead of dependency roulette.
- **Instant, signed differential updates** — without bloating bundles.
- **Intelligent and local-first by default.**

We are not claiming these are done. We are building them in order, honestly, and
labeling exactly where we are.

## Packages

All packages live under the [`@mindees`](https://www.npmjs.com/org/mindees) npm
scope and share **one locked version line**.

| Package | Codename | Purpose | Status |
| --- | --- | --- | --- |
| `@mindees/core` | — | Runtime, reactivity, scheduler, component model | 🚧 Scaffold |
| `@mindees/compiler` | MDC | Build-time optimizer & codegen | 🚧 Scaffold |
| `@mindees/cli` | Forge | `mindees` CLI: create / dev / build / deploy | 🚧 Scaffold |
| `@mindees/router` | Quantum | Typed, data-aware router | 🚧 Scaffold |
| `@mindees/renderer` | Helix | Native + GPU-canvas renderer | 🚧 Scaffold |
| `@mindees/atlas` | Atlas | Batteries-included component library | 🚧 Scaffold |
| `@mindees/ai` | Synapse | On-device + dev-time intelligence | 🚧 Scaffold |
| `@mindees/data` | Continuum | Local-first store & sync | 🚧 Scaffold |
| `@mindees/updates` | Pulse | Signed differential OTA + SDUI | 🚧 Scaffold |
| `create-mindees` | — | Project scaffolder | 🚧 Scaffold |

> 🚧 **Scaffold** = the package exists and builds, but exports only package
> metadata (`name`, `VERSION`, `maturity`, `info`), the `Maturity`/`PackageInfo`
> status types, and the `NotImplementedError` / `notImplemented` utilities. Real
> functionality arrives in its implementation phase (see [ROADMAP.md](./ROADMAP.md)).

## Quickstart (contributors)

There is no end-user install yet. To work on the framework:

```bash
corepack enable
git clone https://github.com/mindees/mindees.git
cd mindees
pnpm install
pnpm verify   # lint + typecheck + test + build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

## We're looking for help with

MindeesNative is built in the open and actively wants contributors. Early areas:

- The reactive **core** (signals) and **scheduler**.
- The **compiler** pipeline (parser/transform/codegen).
- The **router** fundamentals (typed, validated params).
- Examples, docs, and tests.

Check [`good first issue`](https://github.com/mindees/mindees/labels/good%20first%20issue)
and [`help wanted`](https://github.com/mindees/mindees/labels/help%20wanted),
read [GOVERNANCE.md](./GOVERNANCE.md), and open a draft PR — we'll help you land it.

## License

Dual-licensed under **MIT OR Apache-2.0**. See [LICENSE](./LICENSE).

`SPDX-License-Identifier: MIT OR Apache-2.0`
