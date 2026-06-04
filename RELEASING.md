# Releasing MindeesNative

All `@mindees/*` packages (and `create-mindees`) ship as **one locked version line**
(Changesets `fixed` group), so every release bumps them together.

## How a release flows

1. **Author changesets.** For any user-facing change, run `pnpm changeset` and describe it.
   The changeset records the bump type (patch/minor/major) for the whole group.
2. **Version PR (automated).** On every push to `main`, the [Release workflow](.github/workflows/release.yml)
   runs `pnpm version-packages` — which is `changeset version` **plus**
   `scripts/sync-versions.mjs` — and opens/updates a **“chore: version packages”** PR. That PR
   bumps every `package.json` *and* the matching source `VERSION` constant, and updates the
   versions `create-mindees` pins into scaffolded apps.
3. **Review + merge the version PR.** Merging it lands the real version (e.g. `0.1.0`) on `main`.
4. **Publish (manual, maintainer-gated).** Publishing is a deliberate, irreversible action and is
   **not** wired into CI. With npm auth configured, a maintainer runs:

   ```sh
   pnpm release
   ```

   which is `sync-versions.mjs --check --assert-released && pnpm build && pnpm check:exports &&
   pnpm check:pack && changeset publish`. The guards mean it **refuses to publish `0.0.0`**,
   fails if any source `VERSION` has drifted from its `package.json`, and validates the packed
   artifacts before anything reaches npm.

## Version-source sync

Each package exports `VERSION` from source (runtime metadata; `@mindees/cli` also pins it into the
apps it scaffolds). `scripts/sync-versions.mjs` keeps that literal equal to `package.json`:

- `node scripts/sync-versions.mjs` — rewrite sources to match `package.json` (run by `version-packages`).
- `pnpm check:versions` — fail if any source is out of sync (run in CI).
- `node scripts/sync-versions.mjs --assert-released` — fail if any version is still `0.0.0` (publish guard).

## Packed artifact readiness

`pnpm check:pack` runs after `pnpm build` in CI and before `changeset publish` in `pnpm release`.
It is intentionally stricter than source-level export checks:

- packs every public workspace package into a `.tgz`,
- verifies packed `exports` and `bin` targets exist,
- fails if a packed manifest still contains a `workspace:` dependency range,
- fails if source or test files leak into the published tarball,
- installs all packed tarballs into a temporary fixture with sibling packages overridden to those
  tarballs and `pnpm install --prefer-offline`,
- imports every exported package/subpath from that fixture,
- runs the packed `mindees --help` and `create-mindees --help` bins, and
- prints packed/unpacked size evidence for package-size review.

The default artifact budgets are intentionally generous for pre-alpha packages: 2 MiB per package
and 10 MiB total. Override them with `PACK_READINESS_MAX_PACKAGE_BYTES` or
`PACK_READINESS_MAX_TOTAL_BYTES` only when the size increase is reviewed and intentional.

## Before the first publish

- **Confirm npm name availability** for every public package: `@mindees/{core,compiler,cli,router,
  renderer,ai,data,updates,atlas}` and `create-mindees`. (The `@mindees` scope already hosts the
  maintainer's separate RN product packages — `@mindees/ui`, `@mindees/blocks`, `@mindees/icons`,
  `@mindees/tokens` — which are **not** part of this framework.)
- **Configure npm auth** — an automation `NPM_TOKEN`, or (preferred) OIDC trusted publishing with
  `id-token: write` for provenance. The release workflow does not request `id-token: write` today
  because it deliberately does not publish.
- **Pick the first version** — likely `0.1.0` (pre-1.0; APIs are 🧪 experimental).

## To automate publishing later

Add to the Release workflow's changesets step: `publish: pnpm release`, plus `id-token: write`
permission (OIDC provenance) or an `NPM_TOKEN` env. Then merging a version PR publishes
automatically after the same version, export, packed-artifact, and build guards pass.
