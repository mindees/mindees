/**
 * Pulse **server-driven UI (SDUI)** — ship UI as *data* over OTA and render it through
 * `@mindees/core`'s `createElement` + signals. The headline risk is injection, so this
 * module is **allowlist-first** and **never evaluates** any transported string:
 *
 * - {@link compileSdui} validates an untrusted {@link SduiNode} tree (fail-closed, like
 *   `parseManifest`) against an injected {@link SduiRegistry} allowlist and compiles it
 *   to a `MindeesNode`. Unknown tags/actions, missing bindings, limit breaches, and
 *   dangerous keys all throw {@link SduiError}.
 * - Named **actions** (`{ "$action": "name", "args"? }`) compile to a function calling a
 *   pre-registered handler; **bindings** (`{ "$bind": "path" }`) resolve to a value or a
 *   `() => value` accessor (a reactive region). Neither ever transports code.
 * - {@link applyMergePatch} (RFC 7396) and {@link applyJsonPatch} (a safe RFC 6902
 *   subset — `add`/`remove`/`replace`) patch the JSON tree; the result MUST be re-run
 *   through {@link compileSdui} before render, so a delta can never bypass the allowlist.
 *
 * Exported from the **`@mindees/updates/sdui`** subpath; depends only on `@mindees/core`
 * (the renderer is an optional peer the consumer mounts). See
 * `docs/adr/0011-pulse-sdui.md`.
 *
 * @module
 */

import { type Component, createElement, type MindeesNode } from '@mindees/core'

/** A plain JSON value. SDUI markers (`$action`/`$bind`) are never interpreted inside one. */
export type SduiJson = string | number | boolean | null | SduiJson[] | { [key: string]: SduiJson }

/** A reference to a pre-registered action handler (a prop's direct value). */
export interface SduiActionRef {
  readonly $action: string
  readonly args?: SduiJson
}

/** A reference to a data binding resolved at compile time (a prop's direct value). */
export interface SduiBindRef {
  readonly $bind: string
}

/** A compiled prop's source value: plain JSON, or an action/bind marker. */
export type SduiPropValue = SduiJson | SduiActionRef | SduiBindRef

/** A server-driven UI node: a versioned, allowlisted element description. */
export interface SduiNode {
  readonly schema: 1
  readonly tag: string
  readonly props?: Readonly<Record<string, SduiPropValue>>
  readonly children?: ReadonlyArray<SduiNode | string>
  readonly key?: string
}

/** A registered action handler. `args` come from the node; `event` from the renderer. */
export type SduiActionHandler = (args: SduiJson | undefined, ...event: unknown[]) => unknown

/** Hard caps that bound a malicious or runaway payload. */
export interface SduiLimits {
  readonly maxDepth: number
  readonly maxNodes: number
  readonly maxStringLength: number
  readonly maxProps: number
}

/** Injected allowlist + handlers + bindings for {@link compileSdui}. */
export interface SduiRegistry {
  /** Allowlist: SDUI tag → a host-tag string or a {@link Component}. Unknown tags are rejected. */
  readonly components: Readonly<Record<string, string | Component<never>>>
  /** Named action handlers (resolved for `{ $action }` props). */
  readonly actions?: Readonly<Record<string, SduiActionHandler>>
  /** Resolver for `{ $bind }` props — may return a `() => value` accessor for reactivity. */
  readonly bindings?: (path: string) => unknown
  /** Overrides for the default {@link SduiLimits}. */
  readonly limits?: Partial<SduiLimits>
}

/** Stable code identifying why an SDUI operation failed. */
export type SduiErrorCode =
  | 'SDUI_INVALID'
  | 'SDUI_UNKNOWN_TAG'
  | 'SDUI_UNKNOWN_ACTION'
  | 'SDUI_NO_BINDINGS'
  | 'SDUI_LIMIT'
  | 'SDUI_FORBIDDEN_KEY'
  | 'SDUI_PATCH_INVALID'

/** An SDUI error carrying a stable {@link SduiErrorCode}. */
export class SduiError extends Error {
  readonly code: SduiErrorCode
  constructor(code: SduiErrorCode, message: string) {
    super(message)
    this.name = 'SduiError'
    this.code = code
  }
}

const DEFAULT_LIMITS: SduiLimits = {
  maxDepth: 50,
  maxNodes: 5000,
  maxStringLength: 100_000,
  maxProps: 100,
}

/** Keys that must never be set from untrusted input (prototype-pollution vectors). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const NODE_KEYS = new Set(['schema', 'tag', 'props', 'children', 'key'])

/** Build an {@link SduiError} with a stable code. */
function err(code: SduiErrorCode, message: string): SduiError {
  return new SduiError(code, message)
}

/** Narrow to a plain (non-array, non-null) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an untrusted SDUI tree against `registry` and compile it to a `MindeesNode`.
 * Throws {@link SduiError} on any violation (fail closed).
 */
export function compileSdui(node: unknown, registry: SduiRegistry): MindeesNode {
  const limits: SduiLimits = { ...DEFAULT_LIMITS, ...registry.limits }
  let nodeCount = 0

  const checkString = (s: string): void => {
    if (s.length > limits.maxStringLength) {
      throw err('SDUI_LIMIT', `string exceeds max length ${limits.maxStringLength}`)
    }
  }

  // Deep-validate + clone plain JSON. Markers are NOT interpreted here (only data).
  // Every value counts against the shared node budget so a single node's props/args
  // can't carry an unbounded payload (DoS amplification).
  const compileJson = (value: unknown, depth: number): SduiJson => {
    if (depth > limits.maxDepth) throw err('SDUI_LIMIT', 'value exceeds max depth')
    if (++nodeCount > limits.maxNodes)
      throw err('SDUI_LIMIT', `payload exceeds max nodes ${limits.maxNodes}`)
    if (value === null) return null
    const t = typeof value
    if (t === 'string') {
      checkString(value as string)
      return value as string
    }
    if (t === 'number') {
      if (!Number.isFinite(value)) throw err('SDUI_INVALID', 'numbers must be finite')
      return value as number
    }
    if (t === 'boolean') return value as boolean
    if (Array.isArray(value)) return value.map((v) => compileJson(v, depth + 1))
    if (isPlainObject(value)) {
      const keys = Object.keys(value)
      if (keys.length > limits.maxProps)
        throw err('SDUI_LIMIT', `object exceeds max keys ${limits.maxProps}`)
      const out: Record<string, SduiJson> = {}
      for (const k of keys) {
        if (FORBIDDEN_KEYS.has(k)) throw err('SDUI_FORBIDDEN_KEY', `forbidden key "${k}"`)
        out[k] = compileJson(value[k], depth + 1)
      }
      return out
    }
    throw err('SDUI_INVALID', `unsupported value of type ${t}`)
  }

  // Compile a prop's DIRECT value: action/bind markers are recognized only here, never
  // inside args or nested data (so untrusted data cannot promote itself to a handler).
  const compilePropValue = (value: unknown): unknown => {
    if (isPlainObject(value) && Object.hasOwn(value, '$action')) {
      const keys = Object.keys(value)
      if (keys.some((k) => k !== '$action' && k !== 'args')) {
        throw err('SDUI_INVALID', 'an $action ref may only contain $action and args')
      }
      const name = value.$action
      if (typeof name !== 'string') throw err('SDUI_INVALID', '$action must be a string')
      const handler =
        registry.actions && Object.hasOwn(registry.actions, name)
          ? registry.actions[name]
          : undefined
      if (typeof handler !== 'function') {
        throw err('SDUI_UNKNOWN_ACTION', `action "${name}" is not registered`)
      }
      const args = value.args !== undefined ? compileJson(value.args, 0) : undefined
      return (...event: unknown[]) => handler(args, ...event)
    }
    if (isPlainObject(value) && Object.hasOwn(value, '$bind')) {
      const keys = Object.keys(value)
      if (keys.some((k) => k !== '$bind'))
        throw err('SDUI_INVALID', 'a $bind ref may only contain $bind')
      if (typeof value.$bind !== 'string') throw err('SDUI_INVALID', '$bind must be a string')
      checkString(value.$bind)
      if (!registry.bindings)
        throw err('SDUI_NO_BINDINGS', `$bind "${value.$bind}" but no bindings provider`)
      return registry.bindings(value.$bind)
    }
    return compileJson(value, 0)
  }

  const compileProps = (rawProps: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = Object.create(null)
    if (rawProps === undefined) return out
    if (!isPlainObject(rawProps)) throw err('SDUI_INVALID', 'node.props must be an object')
    const keys = Object.keys(rawProps)
    if (keys.length > limits.maxProps) {
      throw err('SDUI_LIMIT', `node has more than ${limits.maxProps} props`)
    }
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) throw err('SDUI_FORBIDDEN_KEY', `forbidden prop key "${key}"`)
      // `key` and `children` are structural: they must come through the validated
      // node.key (string) / node.children paths, never an arbitrary-typed prop value.
      if (key === 'key' || key === 'children') {
        throw err('SDUI_INVALID', `"${key}" is reserved — use node.${key}, not a prop`)
      }
      out[key] = compilePropValue(rawProps[key])
    }
    return out
  }

  const compileNode = (raw: unknown, depth: number): MindeesNode => {
    if (depth > limits.maxDepth)
      throw err('SDUI_LIMIT', `tree exceeds max depth ${limits.maxDepth}`)
    if (++nodeCount > limits.maxNodes)
      throw err('SDUI_LIMIT', `tree exceeds max nodes ${limits.maxNodes}`)
    if (!isPlainObject(raw)) throw err('SDUI_INVALID', 'node must be an object')
    for (const k of Object.keys(raw)) {
      if (!NODE_KEYS.has(k)) throw err('SDUI_INVALID', `unknown node key "${k}"`)
    }
    if (raw.schema !== 1) throw err('SDUI_INVALID', 'node.schema must be 1')
    if (typeof raw.tag !== 'string' || raw.tag.length === 0) {
      throw err('SDUI_INVALID', 'node.tag must be a non-empty string')
    }
    if (!Object.hasOwn(registry.components, raw.tag)) {
      throw err('SDUI_UNKNOWN_TAG', `tag "${raw.tag}" is not in the component allowlist`)
    }
    const component = registry.components[raw.tag]
    if (component === undefined) {
      throw err('SDUI_UNKNOWN_TAG', `tag "${raw.tag}" is not in the component allowlist`)
    }

    const props = compileProps(raw.props)
    if (raw.key !== undefined) {
      if (typeof raw.key !== 'string') throw err('SDUI_INVALID', 'node.key must be a string')
      checkString(raw.key)
      props.key = raw.key
    }

    const children: MindeesNode[] = []
    if (raw.children !== undefined) {
      if (!Array.isArray(raw.children)) throw err('SDUI_INVALID', 'node.children must be an array')
      for (const child of raw.children) {
        if (typeof child === 'string') {
          // String children also count against the node budget (so a wide child list
          // can't slip past maxNodes and overflow the argument spread below).
          if (++nodeCount > limits.maxNodes) {
            throw err('SDUI_LIMIT', `tree exceeds max nodes ${limits.maxNodes}`)
          }
          checkString(child)
          children.push(child)
        } else {
          children.push(compileNode(child, depth + 1))
        }
      }
    }

    // The child count is bounded by maxNodes above; the try/catch is a fail-closed net
    // so even a pathological config surfaces as SduiError, never an uncatchable RangeError.
    try {
      return createElement(component, props, ...children)
    } catch (e) {
      if (e instanceof RangeError) throw err('SDUI_LIMIT', 'too many children to construct')
      throw e
    }
  }

  return compileNode(node, 0)
}

// ---------------------------------------------------------------------------
// Incremental updates (the result MUST be re-validated via compileSdui)
// ---------------------------------------------------------------------------

/** Recursion cap for the patch helpers — well below a native stack overflow, generous for real JSON. */
const MAX_PATCH_DEPTH = 1000

/** Deep-clone a JSON value, rejecting any prototype-pollution keys (fail closed). */
function cloneJson(value: SduiJson, depth = 0): SduiJson {
  if (depth > MAX_PATCH_DEPTH) throw err('SDUI_PATCH_INVALID', 'value exceeds max depth')
  if (Array.isArray(value)) return value.map((v) => cloneJson(v, depth + 1))
  if (isPlainObject(value)) {
    const out: Record<string, SduiJson> = {}
    for (const k of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw err('SDUI_FORBIDDEN_KEY', `forbidden key "${k}"`)
      out[k] = cloneJson(value[k] as SduiJson, depth + 1)
    }
    return out
  }
  return value
}

/** Recursive RFC 7396 merge (internal; depth-guarded, prototype-pollution-safe). */
function mergePatch(target: SduiJson | undefined, patch: SduiJson, depth: number): SduiJson {
  if (depth > MAX_PATCH_DEPTH) throw err('SDUI_PATCH_INVALID', 'patch exceeds max depth')
  if (!isPlainObject(patch)) return cloneJson(patch, depth)
  const base = isPlainObject(target) ? target : {}
  const out: Record<string, SduiJson> = {}
  for (const k of Object.keys(base)) {
    // Reject prototype-pollution keys on the BASE side too (not just the patch).
    // An own `__proto__` key (e.g. from JSON.parse of the prior OTA doc) would
    // otherwise hit the Object.prototype setter via `out[k] = ...` and corrupt the
    // returned object's prototype — mirroring the guard in the patch loop below.
    if (FORBIDDEN_KEYS.has(k)) throw err('SDUI_FORBIDDEN_KEY', `forbidden key "${k}"`)
    if (!Object.hasOwn(patch, k)) out[k] = cloneJson(base[k] as SduiJson, depth + 1)
  }
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(k)) throw err('SDUI_FORBIDDEN_KEY', `forbidden key "${k}"`)
    const pv = patch[k] as SduiJson
    if (pv === null) continue // null deletes the key (RFC 7396)
    out[k] = mergePatch(isPlainObject(base) ? (base[k] as SduiJson) : undefined, pv, depth + 1)
  }
  return out
}

/**
 * Apply an RFC 7396 JSON Merge Patch, returning a new value (the input is untouched).
 * `null` members delete keys; objects merge recursively; arrays/primitives replace.
 * Prototype-pollution keys are rejected.
 */
export function applyMergePatch(target: SduiJson, patch: SduiJson): SduiJson {
  return mergePatch(target, patch, 0)
}

/** One operation of the safe RFC 6902 subset (`add` / `remove` / `replace`). */
export interface JsonPatchOp {
  readonly op: 'add' | 'remove' | 'replace'
  readonly path: string
  readonly value?: SduiJson
}

/** Parse an RFC 6901 JSON Pointer into its decoded tokens; reject dangerous segments. */
function parsePointer(path: string): string[] {
  if (path === '') return []
  if (!path.startsWith('/')) throw err('SDUI_PATCH_INVALID', `invalid JSON Pointer "${path}"`)
  return path
    .slice(1)
    .split('/')
    .map((raw) => {
      const token = raw.replace(/~1/g, '/').replace(/~0/g, '~')
      if (FORBIDDEN_KEYS.has(token))
        throw err('SDUI_FORBIDDEN_KEY', `forbidden pointer segment "${token}"`)
      return token
    })
}

/** Parse + bounds-check an array-index pointer token (`allowEnd` permits `== length` for add). */
function toArrayIndex(token: string, length: number, allowEnd: boolean): number {
  if (!/^\d+$/.test(token)) throw err('SDUI_PATCH_INVALID', `invalid array index "${token}"`)
  const idx = Number(token)
  if (idx > length || (!allowEnd && idx >= length)) {
    throw err('SDUI_PATCH_INVALID', `array index ${idx} out of range`)
  }
  return idx
}

/**
 * Apply a safe RFC 6902 patch (`add`/`remove`/`replace` only) to `doc`, returning a new
 * value (the input is untouched). `move`/`copy`/`test` are intentionally unsupported and
 * throw. Prototype-pollution keys/segments are rejected. The result must still be
 * re-validated via {@link compileSdui} before render.
 */
export function applyJsonPatch(doc: SduiJson, ops: readonly JsonPatchOp[]): SduiJson {
  if (!Array.isArray(ops)) throw err('SDUI_PATCH_INVALID', 'ops must be an array')
  let root = cloneJson(doc)
  for (const op of ops) {
    // Fail closed (stable SduiError) on a malformed op envelope, not a raw TypeError.
    if (!isPlainObject(op) || typeof op.path !== 'string') {
      throw err('SDUI_PATCH_INVALID', 'each op must be an object with a string path')
    }
    if (op.op !== 'add' && op.op !== 'remove' && op.op !== 'replace') {
      throw err('SDUI_PATCH_INVALID', `unsupported op "${String((op as { op: unknown }).op)}"`)
    }
    if (op.op !== 'remove' && op.value === undefined) {
      throw err('SDUI_PATCH_INVALID', `op "${op.op}" requires a value`)
    }
    const tokens = parsePointer(op.path)

    if (tokens.length === 0) {
      if (op.op === 'remove') throw err('SDUI_PATCH_INVALID', 'cannot remove the whole document')
      root = cloneJson(op.value as SduiJson)
      continue
    }

    // Navigate to the parent of the target (the doc was already deep-cloned).
    let parent: SduiJson = root
    for (let i = 0; i < tokens.length - 1; i++) {
      const token = tokens[i] as string
      if (Array.isArray(parent)) {
        parent = parent[toArrayIndex(token, parent.length, false)] as SduiJson
      } else if (isPlainObject(parent) && Object.hasOwn(parent, token)) {
        parent = parent[token] as SduiJson
      } else {
        throw err('SDUI_PATCH_INVALID', `path not found: ${op.path}`)
      }
    }

    const last = tokens[tokens.length - 1] as string
    if (Array.isArray(parent)) {
      if (op.op === 'add') {
        const idx = last === '-' ? parent.length : toArrayIndex(last, parent.length, true)
        parent.splice(idx, 0, cloneJson(op.value as SduiJson))
      } else {
        const idx = toArrayIndex(last, parent.length, false)
        if (op.op === 'replace') parent[idx] = cloneJson(op.value as SduiJson)
        else parent.splice(idx, 1)
      }
    } else if (isPlainObject(parent)) {
      if (FORBIDDEN_KEYS.has(last)) throw err('SDUI_FORBIDDEN_KEY', `forbidden key "${last}"`)
      if (op.op === 'remove' || op.op === 'replace') {
        if (!Object.hasOwn(parent, last)) {
          throw err('SDUI_PATCH_INVALID', `target not found: ${op.path}`)
        }
      }
      if (op.op === 'remove') delete parent[last]
      else parent[last] = cloneJson(op.value as SduiJson)
    } else {
      throw err('SDUI_PATCH_INVALID', `cannot apply at ${op.path}`)
    }
  }
  return root
}
