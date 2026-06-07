# create-mindees

Scaffold a new MindeesNative app:

```bash
npm create mindees@latest my-app
# or: pnpm create mindees my-app --template app
```

> **Status: 🧪 Experimental (pre-1.0).** Implemented and tested. Delegates to
> `@mindees/cli`'s tested `scaffold` core, so `npm create mindees` and
> `mindees create` behave identically. Generated apps pin every `@mindees/*`
> package to the same locked version that scaffolded them (currently `0.13.0`).

## Usage

```bash
create-mindees <app-name-or-path> [--template blank|counter|app] [--prompt "..."] [--force]
```

- `--template` — pick a starter (`blank`, `counter`, or `app`). Default `blank`.
  - `blank` — the minimal runnable app (one screen).
  - `counter` — a reactive counter demonstrating signals + fine-grained updates.
  - `app` — a polished, batteries-included starter using the `@mindees/atlas`
    UI kit (Card, Button, Switch), a hook, and theming.
- `--prompt "a reactive counter"` — offline keyword mapping to a template
  (real natural-language app generation arrives with `@mindees/ai` in Phase 10).
- `--force` — overwrite a non-empty target directory.
- The positional can be a simple app name, a relative path, or an absolute
  Windows/POSIX path; the generated package name is derived safely from the
  final directory name.

## License

`MIT OR Apache-2.0`
