/**
 * `scaffold` — write a template into a target directory.
 *
 * Pure over an injected {@link FileSystem}, so `create` and `create-mindees`
 * share one tested implementation. Refuses to write into a non-empty target
 * unless `force` is set.
 *
 * `force` OVERLAYS the template: each template file is written (overwriting any
 * same-named file), but pre-existing files the template does NOT include are left
 * in place — it is a merge, not a clean wipe (the {@link FileSystem} abstraction
 * has no delete primitive, and recursively removing a user's files would be
 * unsafe). Scaffold into an empty directory for a pristine result.
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
  /** Overlay the template into a non-empty target (merge; does not delete extra files). Default `false`. */
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
 * template is unknown or the target is non-empty (without `force`). With `force`,
 * the template is overlaid onto the target (see the module note: a merge, not a wipe).
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
      // targetDir exists but could not be listed. The common cause is that it is a regular
      // FILE rather than a directory (readDir throws ENOTDIR), but it could also be a
      // permission error (EACCES) or another I/O failure — don't assert a specific cause we
      // didn't verify. Report it cleanly instead of letting the exception escape (the CLI
      // contract is "never throws for expected failures").
      return {
        ok: false,
        written: [],
        template,
        error: `Target "${targetDir}" exists but could not be read (it may be a file or inaccessible).`,
      }
    }
    if (!force && existing.length > 0) {
      return {
        ok: false,
        written: [],
        template,
        error: `Target directory "${targetDir}" is not empty. Use --force to overlay the template (merges; keeps existing files).`,
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
