/** Resolved create target metadata shared by `mindees create` and `create-mindees`. */
export interface CreateTarget {
  /** Raw user input after trimming. */
  input: string
  /** Target directory with POSIX separators and normalized `.` / `..` segments. */
  targetDir: string
  /** npm-safe package name derived from the final path segment. */
  packageName: string
  /** Directory string to show in follow-up `cd` guidance. */
  displayDir: string
}

/** Outcome of create target resolution. */
export type CreateTargetResult =
  | ({ ok: true } & CreateTarget)
  | {
      ok: false
      error: string
    }

const WINDOWS_DRIVE_ROOT = /^([a-zA-Z]:)\//

function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function hasAbsoluteRoot(path: string): boolean {
  return path.startsWith('/') || WINDOWS_DRIVE_ROOT.test(path)
}

function normalizeLogicalPath(path: string): string {
  const normalized = toPosixPath(path)
  const drive = normalized.match(WINDOWS_DRIVE_ROOT)?.[1]
  const root = drive ? `${drive}/` : normalized.startsWith('/') ? '/' : ''
  const body = root ? normalized.slice(root.length) : normalized
  const parts: string[] = []

  for (const segment of body.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      const previous = parts.at(-1)
      if (previous && previous !== '..') {
        parts.pop()
      } else if (!root) {
        parts.push(segment)
      }
      continue
    }
    parts.push(segment)
  }

  const suffix = parts.join('/')
  if (root) return suffix ? `${root}${suffix}` : root
  return suffix || '.'
}

function pathBasename(path: string): string {
  const normalized = toPosixPath(path).replace(/\/+$/, '')
  const parts = normalized.split('/').filter(Boolean)
  return parts.at(-1) ?? ''
}

function isPathLike(input: string): boolean {
  const normalized = toPosixPath(input)
  return (
    normalized.includes('/') ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    hasAbsoluteRoot(normalized)
  )
}

function sanitizePackageName(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 214)
    .replace(/-+$/g, '')
}

/**
 * Resolve a `create` positional into a real target directory plus an npm-safe
 * package name. Accepts simple names, relative paths, and absolute Windows/POSIX
 * paths without letting the package name inherit path separators.
 */
export function resolveCreateTarget(input: string, cwd = '.'): CreateTargetResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: 'create: missing app name or target path.' }
  }

  const basename = pathBasename(trimmed)
  if (!basename || basename === '.' || basename === '..') {
    return { ok: false, error: `Could not derive a package name from "${input}".` }
  }

  const packageName = sanitizePackageName(basename)
  if (!packageName) {
    return {
      ok: false,
      error: `Could not derive a valid npm package name from "${basename}". Use a name with letters or numbers.`,
    }
  }

  const targetInput = toPosixPath(trimmed)
  const cwdPath = normalizeLogicalPath(cwd || '.')
  const targetDir = hasAbsoluteRoot(targetInput)
    ? normalizeLogicalPath(targetInput)
    : normalizeLogicalPath(cwdPath === '.' ? targetInput : `${cwdPath}/${targetInput}`)

  return {
    ok: true,
    input: trimmed,
    targetDir,
    packageName,
    displayDir: isPathLike(trimmed) ? targetDir : trimmed,
  }
}
