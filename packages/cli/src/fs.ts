/**
 * A tiny filesystem abstraction so CLI commands are testable without touching
 * the real disk. The `bin` layer supplies a `node:fs`-backed implementation; the
 * core (`scaffold`, `buildProject`) takes a {@link FileSystem}.
 *
 * @module
 */

/** The minimal filesystem surface the CLI core needs. */
export interface FileSystem {
  /** True if a file or directory exists at `path`. */
  exists(path: string): boolean
  /** Read a UTF-8 file. Throws if missing. */
  readFile(path: string): string
  /** Write a UTF-8 file, creating parent directories as needed. */
  writeFile(path: string, contents: string): void
  /** Create a directory (and parents). No-op if it exists. */
  mkdir(path: string): void
  /** List files (recursively) under `dir`, returned as POSIX-relative paths. */
  readDir(dir: string): string[]
}

/** An in-memory {@link FileSystem} for tests and dry runs. */
export function createMemoryFileSystem(initial: Record<string, string> = {}): FileSystem & {
  /** Snapshot of all written files (path → contents). */
  snapshot(): Record<string, string>
} {
  const files = new Map<string, string>(Object.entries(initial))
  const dirs = new Set<string>()

  // Normalize to POSIX separators, drop a leading `./`, collapse `//` and `/./`,
  // and strip a trailing slash — so `./dist/App.js` and `dist/App.js` are equal.
  const norm = (p: string) =>
    p
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/\/\.\//g, '/')
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '')

  return {
    exists: (path) => {
      const p = norm(path)
      if (files.has(p) || dirs.has(p)) return true
      // A path is a directory if any file lives under it.
      const prefix = `${p}/`
      for (const f of files.keys()) if (f.startsWith(prefix)) return true
      return false
    },
    readFile: (path) => {
      const p = norm(path)
      const c = files.get(p)
      if (c === undefined) throw new Error(`ENOENT: ${p}`)
      return c
    },
    writeFile: (path, contents) => {
      files.set(norm(path), contents)
    },
    mkdir: (path) => {
      dirs.add(norm(path))
    },
    readDir: (dir) => {
      const prefix = dir === '' || dir === '.' ? '' : `${norm(dir)}/`
      const out: string[] = []
      for (const f of files.keys()) {
        if (prefix === '' || f.startsWith(prefix)) {
          out.push(prefix === '' ? f : f.slice(prefix.length))
        }
      }
      return out.sort()
    },
    snapshot: () => Object.fromEntries([...files.entries()].sort()),
  }
}
