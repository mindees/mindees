# MindeesNative RFCs

Substantial changes to MindeesNative go through a written **RFC** (Request for
Comments). RFCs are how we design in public: they make the reasoning behind a
decision durable and reviewable.

## When you need an RFC

- New public API surface, or breaking changes to existing API.
- A new `@mindees/*` package.
- Cross-cutting architecture (renderer backends, compiler passes, the module
  ABI, the sync protocol, the update format, etc.).
- Anything that meaningfully changes the developer-facing contract.

Bug fixes, docs, tests, and internal refactors usually do **not** need an RFC.

## Process

1. Copy [`0000-template.md`](./0000-template.md) to
   `rfcs/0000-my-proposal.md` (keep `0000` until a number is assigned).
2. Fill it in. Open a PR adding the file.
3. Discussion happens on the PR. Iterate.
4. When a maintainer accepts it, the RFC is assigned the next number, marked
   `Status: Accepted`, and merged. Rejected RFCs are still merged (marked
   `Rejected`) so the reasoning is preserved.
5. Implementation tracks the accepted RFC; link the RFC from the implementing
   PRs.

See [GOVERNANCE.md](../GOVERNANCE.md) for how decisions are made.

## Index

| RFC | Title | Status |
| --- | ----- | ------ |
| [0001](./0001-monorepo-toolchain-and-version-line.md) | Monorepo toolchain & single locked version line | Accepted |

> The worked example RFC-0001 documents the Phase 0 toolchain decision and is
> finalized once the research-verified versions are pinned.
