/**
 * `scaffold` — write a template into a target directory.
 *
 * Pure over an injected {@link FileSystem}, so `create` and `create-mindees`
 * share one tested implementation. Refuses to overwrite a non-empty target
 * unless `force` is set.
 *
 * @module
 */

import type { FileSystem } from './fs'
import { DEFAULT_TEMPLATE, getTemplate, materialize, templateNames } from './templates'

/** Options for {@link scaffold}. */
export interface ScaffoldOptions {
  /** App/directory name (also used to substitute `{{appName}}`). */
  appName: string
  /** Target directory to write into. */
  targetDir: string
  /** Template name. Defaults to `blank`. */
  template?: string
  /** Overwrite a non-empty target directory. Default `false`. */
  force?: boolean
}

/** Outcome of a scaffold. */
export interface ScaffoldResult {
  ok: boolean
  /** Files written (relative to `targetDir`), sorted. */
  written: string[]
  /** Reason for failure, if `ok` is false. */
  error?: string
  /** The resolved template name. */
  template: string
}

/**
 * Scaffold a new project. Returns the list of files written, or an error if the
 * template is unknown or the target is non-empty (without `force`).
 */
export function scaffold(fs: FileSystem, options: ScaffoldOptions): ScaffoldResult {
  const { appName, targetDir, template = DEFAULT_TEMPLATE, force = false } = options

  const tpl = getTemplate(template)
  if (!tpl) {
    return {
      ok: false,
      written: [],
      template,
      error: `Unknown template "${template}". Available: ${templateNames().join(', ')}.`,
    }
  }

  if (fs.exists(targetDir)) {
    let existing: string[]
    try {
      existing = fs.readDir(targetDir)
    } catch {
      // targetDir exists but is not a readable directory (e.g. a regular FILE — the
      // real readDir throws ENOTDIR). Report it cleanly instead of letting the
      // exception escape (the CLI contract is "never throws for expected failures").
      return {
        ok: false,
        written: [],
        template,
        error: `Target "${targetDir}" already exists and is not a directory.`,
      }
    }
    if (!force && existing.length > 0) {
      return {
        ok: false,
        written: [],
        template,
        error: `Target directory "${targetDir}" is not empty. Use --force to overwrite.`,
      }
    }
  }

  const files = materialize(tpl, appName)
  const written: string[] = []
  fs.mkdir(targetDir)
  for (const [rel, contents] of Object.entries(files)) {
    fs.writeFile(`${targetDir}/${rel}`, contents)
    written.push(rel)
  }
  written.sort()
  return { ok: true, written, template }
}
