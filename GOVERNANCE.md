# Governance

MindeesNative uses a lightweight, **RFC-driven** governance model. The goals are:
keep decisions transparent and written down, keep the barrier to contributing
low, and keep quality high.

## Roles

- **Users** — anyone using MindeesNative. Feedback and bug reports are
  contributions.
- **Contributors** — anyone who opens an issue, PR, or RFC. No prior status
  required.
- **Maintainers** — listed in [MAINTAINERS.md](./MAINTAINERS.md). They review and
  merge changes, triage issues, and steward one or more areas.
- **Lead** — the founder/lead maintainer, who resolves disputes that consensus
  cannot, and is the steward of the project's direction. The Lead's authority is
  expected to dilute into a maintainer council as the project matures.

## How decisions are made

1. **Lazy consensus.** Most changes proceed by normal PR review. If no
   maintainer objects within a reasonable window and at least one approves, it
   merges.
2. **RFCs for substantial changes.** Anything that changes a public API, adds a
   new package, alters architecture, or affects many users goes through the
   [RFC process](./rfcs/README.md). RFCs are how we think in public.
3. **Disagreement.** Maintainers seek consensus. If consensus cannot be reached,
   the Lead decides and records the rationale (in the RFC or PR).

## What requires an RFC

- New public API surface or breaking changes to existing API.
- New `@mindees/*` packages.
- Cross-cutting architectural decisions (renderer backends, compiler passes,
  the module ABI, the sync protocol, the update format).
- Anything that meaningfully changes the developer-facing contract.

Bug fixes, docs, tests, and internal refactors usually do **not** need an RFC.

## The contributor ladder

1. **Contributor** — land a PR.
2. **Regular contributor** — sustained, quality contributions in an area;
   trusted for review feedback.
3. **Maintainer** — nominated by an existing maintainer based on a track record
   of good judgment and quality work in an area; confirmed by lazy consensus of
   the current maintainers. Added to [MAINTAINERS.md](./MAINTAINERS.md).

## Releases & versioning

- All `@mindees/*` packages share **one locked version line** (atomic upgrades).
- We follow **semantic versioning**. Pre-1.0, minor versions may include
  breaking changes, always documented via Changesets.
- Releases are produced from `main` via the Changesets workflow.

## Code of Conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).
Enforcement is handled by the maintainers via the contacts listed there.

## Changing this document

Governance changes are themselves made by RFC (or, for small clarifications, a
normal PR with maintainer consensus).
