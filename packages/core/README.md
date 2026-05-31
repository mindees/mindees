# @mindees/core

The runtime foundation of MindeesNative.

> **Status: 🚧 Scaffold (Phase 0).** This package does **not** implement the
> runtime yet. Today it exports only package metadata, the `Maturity`/`PackageInfo`
> types, and the shared `NotImplementedError` / `notImplemented` utilities that
> the rest of the framework uses to mark research tracks honestly.

## What it exports today

| Export | Type | Description |
| --- | --- | --- |
| `VERSION` | `string` | Package version (locked across all `@mindees/*`). |
| `name` | `string` | `"@mindees/core"`. |
| `maturity` | `Maturity` | `"scaffold"`. |
| `info` | `PackageInfo` | Identity + maturity metadata. |
| `NotImplementedError` | `class` | Error for declared-but-unbuilt capabilities. |
| `notImplemented` | `(feature, opts?) => never` | Throws `NotImplementedError`. |
| `Maturity`, `PackageInfo` | `type` | Shared metadata types. |

## What it will become

The reactive core (fine-grained **signals**), the **scheduler**, and the
component model — see [ROADMAP.md](../../ROADMAP.md) Phases 1–2.

## License

`MIT OR Apache-2.0`
