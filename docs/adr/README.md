# Architecture Decision Records (ADRs)

An ADR captures a single significant architectural decision: the context, the
decision, and its consequences. ADRs are immutable once accepted — if a decision
changes, write a new ADR that supersedes the old one.

We use a lightweight format (after Michael Nygard's):

```
# ADR-NNNN: <title>

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context
What is the situation and the forces at play?

## Decision
What did we decide, and why?

## Consequences
What becomes easier or harder as a result?
```

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](./0001-toolchain-selection.md) | Toolchain selection (pnpm, Turborepo, Biome, Vitest, Changesets) | Accepted |
| [0002](./0002-compiler-foundation.md) | Compiler foundation — TypeScript Compiler API (not SWC/oxc) | Accepted |
| [0003](./0003-router-architecture.md) | Router architecture — type-level inference, Standard Schema, signals-native state | Accepted |
| [0004](./0004-router-render-integration.md) | Router II — nested render integration via explicit composition | Accepted |
| [0005](./0005-router-data-guards-transitions.md) | Router II — loaders/data, navigation guards, view transitions | Accepted |
| [0006](./0006-native-command-backend.md) | Native renderer foundation — a platform-neutral command backend (Phase 8A) | Accepted |
| [0007](./0007-native-host-conformance.md) | Native host as a strict conformance contract with a verifiable reference host (Phase 8B) | Accepted |
| [0008](./0008-pulse-ota.md) | Pulse (Phase 9) — signed OTA core: manifests, Ed25519 signing, content-addressed store, atomic rollback | Accepted |
| [0009](./0009-pulse-differential-diff.md) | Pulse (Phase 9B) — differential bundle diffing (zero-dep rolling-hash delta) | Accepted |
| [0010](./0010-pulse-reference-server.md) | Pulse (Phase 9C) — reference update server (pure injected core + thin adapter) | Accepted |
| [0011](./0011-pulse-sdui.md) | Pulse (Phase 9D) — server-driven UI (SDUI) subset | Accepted |
| [0012](./0012-continuum-reactive-store.md) | Continuum (Phase 10A) — the reactive local-first document store | Accepted |
| [0013](./0013-continuum-hlc-causality.md) | Continuum (Phase 10B) — Hybrid Logical Clocks + version vectors | Accepted |
| [0014](./0014-continuum-crdt.md) | Continuum (Phase 10C) — CRDT conflict resolution (LWW + add-wins OR-Set) | Accepted |
| [0015](./0015-continuum-sync-engine.md) | Continuum (Phase 10D) — local-first sync engine + transport | Accepted |
| [0016](./0016-continuum-server-persistence.md) | Continuum (Phase 10E/10F) — reference sync server + persistence | Accepted |
| [0017](./0017-synapse-ai-contract.md) | Synapse (Phase 11A) — provider-agnostic AI contract + mock backend | Accepted |
| [0018](./0018-synapse-server-backend.md) | Synapse (Phase 11B) — capability-injected HTTP/SSE backend | Accepted |
| [0019](./0019-synapse-structured-output.md) | Synapse (Phase 11C) — structured output | Accepted |
| [0020](./0020-synapse-tool-calling.md) | Synapse (Phase 11C) — tool calling | Accepted |
| [0021](./0021-synapse-devtools.md) | Synapse (Phase 11D) — dev-time error explainer | Accepted |
| [0022](./0022-atlas-primitives.md) | Atlas (Phase 12) — UI primitives, style & theme | Accepted |
| [0023](./0023-atlas-list.md) | Atlas (Phase 12B) — virtualized recycling `List` | Accepted |
| [0024](./0024-release-pipeline.md) | Release pipeline & version-source sync (Phase 13) | Accepted |
| [0025](./0025-tree-scoped-context.md) | Tree-scoped context & portal-aware visibility (overlay-in-tab) | Proposed |

> ADR-0001 is finalized in Phase 0 once the research-verified tool versions are
> pinned, so its rationale cites real current versions rather than guesses.
