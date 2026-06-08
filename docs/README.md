# MindeesNative Documentation

This directory holds project documentation that lives in the repository.

- [`adr/`](./adr/README.md) - **Architecture Decision Records**: short,
  numbered documents capturing significant technical decisions and their
  context.
- [`prs/`](./prs/README.md) - **Pull-request descriptions** for each phase. When
  automated PR creation isn't available, the PR title and body for a phase are
  written here (e.g. `prs/phase-0.md`).
- [`benchmarks.md`](./benchmarks.md) - reproducible benchmark evidence for
  implemented hot paths.
- [`getting-started.md`](./getting-started.md) - **zero to a running web app**:
  create, dev, the signals/JSX/components model, theming, and configuration.

A full documentation site (per-API reference + guides) is still a later phase.
For "what works today", the source of truth is the root [`STATUS.md`](../STATUS.md)
plus each package's README.
