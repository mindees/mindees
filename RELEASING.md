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

   which is `sync-versions.mjs --check --assert-released && pnpm build && changeset publish`.
   The guards mean it **refuses to publish `0.0.0`** and fails if any source `VERSION` has drifted
   from its `package.json`.

## Version-source sync

Each package exports `VERSION` from source (runtime metadata; `@mindees/cli` also pins it into the
apps it scaffolds). `scripts/sync-versions.mjs` keeps that literal equal to `package.json`:

- `node scripts/sync-versions.mjs` — rewrite sources to match `package.json` (run by `version-packages`).
- `pnpm check:versions` — fail if any source is out of sync (run in CI).
- `node scripts/sync-versions.mjs --assert-released` — fail if any version is still `0.0.0` (publish guard).

## Before the first publish

- **Confirm npm name availability** for every public package: `@mindees/{core,compiler,cli,router,
  renderer,ai,data,updates,atlas}` and `create-mindees`. (The `@mindees` scope already hosts the
  maintainer's separate RN product packages — `@mindees/ui`, `@mindees/blocks`, `@mindees/icons`,
  `@mindees/tokens` — which are **not** part of this framework.)
- **Configure npm auth** — an automation `NPM_TOKEN`, or (preferred) OIDC trusted publishing with
  `id-token: write` for provenance.
- **Pick the first version** — likely `0.1.0` (pre-1.0; APIs are 🧪 experimental).

## To automate publishing later

Add to the Release workflow's changesets step: `publish: pnpm release`, plus `id-token: write`
permission (OIDC provenance) or an `NPM_TOKEN` env. Then merging a version PR publishes
automatically.
