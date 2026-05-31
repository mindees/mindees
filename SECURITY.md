# Security Policy

## Supported versions

MindeesNative is pre-1.0. During the `0.x` series, only the **latest published
`0.x` release line** receives security fixes. Once `1.0` ships, this policy will
be updated with an LTS table.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older `0.x`  | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Preferred: use **GitHub Private Vulnerability Reporting** on the affected
repository under <https://github.com/mindees> (Security → Report a vulnerability).

Alternative: email **security@mindees.dev**.

> Note: organization email addresses (`security@`, `conduct@`) are being
> provisioned. Until DNS is confirmed, GitHub Private Vulnerability Reporting is
> the authoritative channel. This note will be removed once the mailbox is live.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept welcome).
- Affected package(s) and version(s).
- Any suggested remediation.

## Response targets

- **Acknowledgement:** within 72 hours.
- **Triage & severity assessment:** within 7 days.
- **Fix or mitigation plan:** communicated after triage, prioritized by severity.

## Coordinated disclosure

We follow coordinated disclosure. We ask reporters to give us a reasonable
window (target: 90 days, or sooner once a fix ships) before public disclosure.
We will credit reporters who wish to be acknowledged.

## Security-critical surfaces (as they are implemented)

These areas are designed to be security-sensitive and will receive extra review
when their implementation phases land:

- **`@mindees/updates` (Pulse)** — update signing/verification (Ed25519),
  atomic apply + rollback, staged rollout. _(Phase 8)_
- **Module sandboxing & capability scoping** — the WASM Component-Model module
  ABI and the community registry. _(Phases 8/11/12)_
- **`@mindees/ai` (Synapse)** — tool-calling boundaries and prompt/data
  isolation. _(Phase 10)_

> Status (Phase 0): the project is currently a scaffold with **no runtime
> security surface yet**. This policy is in place from day one so the reporting
> process exists before any code that needs it.
