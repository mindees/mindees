# create-mindees

Scaffold a new MindeesNative app:

```bash
npm create mindees@latest my-app
# or: pnpm create mindees my-app --template counter
```

> **Status: 🧪 Experimental (Phase 5).** Implemented and tested. Delegates to
> `@mindees/cli`'s tested `scaffold` core, so `npm create mindees` and
> `mindees create` behave identically.

## Usage

```bash
create-mindees <app-name-or-path> [--template blank|counter] [--prompt "..."] [--force]
```

- `--template` — pick a starter (`blank` or `counter`). Default `blank`.
- `--prompt "a reactive counter"` — offline keyword mapping to a template
  (real natural-language app generation arrives with `@mindees/ai` in Phase 10).
- `--force` — overwrite a non-empty target directory.
- The positional can be a simple app name, a relative path, or an absolute
  Windows/POSIX path; the generated package name is derived safely from the
  final directory name.

## License

`MIT OR Apache-2.0`
