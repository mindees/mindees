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
| 0001 | Toolchain selection (pnpm, Turborepo, Biome, Vitest, Changesets) | Accepted |
| [0002](./0002-compiler-foundation.md) | Compiler foundation — TypeScript Compiler API (not SWC/oxc) | Accepted |

> ADR-0001 is finalized in Phase 0 once the research-verified tool versions are
> pinned, so its rationale cites real current versions rather than guesses.
