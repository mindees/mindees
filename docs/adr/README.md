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

> ADR-0001 is finalized in Phase 0 once the research-verified tool versions are
> pinned, so its rationale cites real current versions rather than guesses.
