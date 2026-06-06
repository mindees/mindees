/**
 * Build-time **perf-lint** — an opt-in pass that flags real performance footguns in the
 * fine-grained reactive + Helix render model, as `warning` {@link Diagnostic}s (it NEVER blocks the
 * build). Honest by design: every rule reports a concrete structural fact and *why* it's slow in
 * THIS model — no invented frame-time numbers. A diagnostic neither React Native nor Flutter ships.
 *
 * Enable via `compileChecked(src, { perf: true })` (or `{ perf: { rules, listSizeThreshold } }`).
 * Suppress a finding with a leading `// mdc-perf-ignore` (all) or `// mdc-perf-ignore MDC_PERF_001`
 * (one code) comment, or `rules: { MDC_PERF_001: 'off' }`.
 *
 * @module
 */

import ts from 'typescript'
import { scriptKindForFile } from './typecheck'
import type { Diagnostic } from './types'

/** Per-call configuration for {@link perfLint}. */
export interface PerfLintOptions {
  /** Turn individual rules on/off (default: all on except `MDC_PERF_007`). */
  readonly rules?: Record<string, 'off' | 'warning'>
  /** Element count at/above which `MDC_PERF_007` fires (default 50). */
  readonly listSizeThreshold?: number
  /** Identifiers treated as keyed list builders (default For/keyedRegion/List/createList/SectionList/createSectionList). */
  readonly keyedNames?: readonly string[]
}

const DEFAULT_KEYED = [
  'For',
  'keyedRegion',
  'List',
  'createList',
  'SectionList',
  'createSectionList',
]
const OFF_BY_DEFAULT = new Set(['MDC_PERF_007'])
/** A `const x = signal()|computed()|memo()|use<Capital>()` binds a reactive accessor. */
const ACCESSOR_FACTORY = /^(signal|computed|memo|use[A-Z])/
const HEAVY_METHODS = new Set([
  'map',
  'filter',
  'reduce',
  'forEach',
  'sort',
  'flatMap',
  'reduceRight',
])
const SUBSCRIBE_CALLS =
  /(addEventListener|setInterval|setTimeout|subscribe|^on$|observe|addListener)/

/** Run the perf-lint over one module's source; returns `warning` diagnostics (possibly empty). */
export function perfLint(
  source: string,
  fileName = 'module.tsx',
  options: PerfLintOptions = {},
): Diagnostic[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2023,
    /* setParentNodes */ true,
    scriptKindForFile(fileName),
  )
  const keyed = new Set(options.keyedNames ?? DEFAULT_KEYED)
  const threshold = options.listSizeThreshold ?? 50
  const out: Diagnostic[] = []

  const isEnabled = (code: string): boolean => {
    const setting = options.rules?.[code]
    if (setting) return setting !== 'off'
    return !OFF_BY_DEFAULT.has(code)
  }

  // --- pre-pass: the set of identifiers bound to reactive accessors (signal/computed/memo/use*) ---
  const accessors = new Set<string>()
  const collectAccessors = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const callee = node.initializer.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ''
      if (ACCESSOR_FACTORY.test(name)) accessors.add(node.name.text)
    }
    ts.forEachChild(node, collectAccessors)
  }
  collectAccessors(sf)

  const positionOf = (node: ts.Node) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    return { line: line + 1, column: character + 1 }
  }
  // Line-based suppression: an `mdc-perf-ignore [CODE]` comment on the finding's line or the line
  // above. This works uniformly for `//` comments AND JSX `{/* … */}` comment children (whose comment
  // text isn't in the flagged node's leading trivia).
  const sourceLines = source.split('\n')
  const isSuppressed = (node: ts.Node, code: string): boolean => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    for (const ln of [line, line - 1]) {
      const m = /mdc-perf-ignore(?:\s+(MDC_PERF_\d+))?/.exec(sourceLines[ln] ?? '')
      if (m && (!m[1] || m[1] === code)) return true
    }
    return false
  }
  const emit = (node: ts.Node, code: string, message: string): void => {
    if (!isEnabled(code) || isSuppressed(node, code)) return
    out.push({ severity: 'warning', code, message, file: fileName, position: positionOf(node) })
  }

  // --- shared AST helpers ---
  const unwrapArrow = (expr: ts.Expression): ts.Expression => {
    // `() => X` → X (the arrow's expression body), else the node itself.
    if (ts.isArrowFunction(expr) && !ts.isBlock(expr.body)) return expr.body
    return expr
  }
  const returnsJsx = (fn: ts.Expression): boolean => {
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false
    let found = false
    const look = (n: ts.Node): void => {
      if (found) return
      if (ts.isJsxElement(n) || ts.isJsxFragment(n) || ts.isJsxSelfClosingElement(n)) {
        found = true
        return
      }
      // don't descend into a NESTED function (its JSX isn't this callback's return)
      if (
        n !== fn &&
        (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
      )
        return
      ts.forEachChild(n, look)
    }
    look(fn.body)
    return found
  }
  const calleeName = (call: ts.CallExpression): string =>
    ts.isIdentifier(call.expression) ? call.expression.text : ''
  const propAccessName = (call: ts.CallExpression): string =>
    ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : ''
  /** Does the subtree reactively read a known accessor (a zero-arg call `acc()`)? */
  const readsAccessor = (root: ts.Node): boolean => {
    let found = false
    const look = (n: ts.Node): void => {
      if (found) return
      if (
        ts.isCallExpression(n) &&
        n.arguments.length === 0 &&
        ts.isIdentifier(n.expression) &&
        accessors.has(n.expression.text)
      ) {
        found = true
        return
      }
      ts.forEachChild(n, look)
    }
    look(root)
    return found
  }
  /** Does the subtree contain a heavy synchronous construct (loop / array-method chain / JSON)? */
  const hasHeavyWork = (root: ts.Node): boolean => {
    let found = false
    const look = (n: ts.Node): void => {
      if (found) return
      if (
        ts.isForStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isWhileStatement(n)
      ) {
        found = true
        return
      }
      if (ts.isCallExpression(n) && HEAVY_METHODS.has(propAccessName(n))) {
        found = true
        return
      }
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.expression) &&
        n.expression.expression.text === 'JSON'
      ) {
        found = true
        return
      }
      ts.forEachChild(n, look)
    }
    look(root)
    return found
  }

  // --- rule matchers ---
  const ruleMapJsxChild = (node: ts.Node): void => {
    if (!ts.isJsxExpression(node) || !node.expression) return
    const parent = node.parent
    if (!parent || !(ts.isJsxElement(parent) || ts.isJsxFragment(parent))) return
    const expr = unwrapArrow(node.expression)
    if (!ts.isCallExpression(expr) || propAccessName(expr) !== 'map') return
    const cb = expr.arguments[0]
    if (!cb || !returnsJsx(cb)) return
    emit(
      node,
      'MDC_PERF_001',
      'List rendered with a bare .map() — on any change this region re-mounts EVERY row ' +
        '(losing focus/scroll/state). Use For({ each, key, children }) (keyed: only the diff is ' +
        'created/moved/disposed) or List({...}) for large lists.',
    )
  }

  const ruleMissingKey = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) return
    const name = calleeName(node)
    if (!keyed.has(name)) return
    const arg = node.arguments[0]
    if (!arg || !ts.isObjectLiteralExpression(arg)) return
    let hasKey = false
    let hasSpread = false
    let hasEach = false
    for (const p of arg.properties) {
      if (ts.isSpreadAssignment(p)) hasSpread = true
      if (
        (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
        p.name &&
        ts.isIdentifier(p.name)
      ) {
        if (p.name.text === 'key') hasKey = true
        if (p.name.text === 'each') hasEach = true
      }
    }
    // Only the `{ each, children }` keyed-region shape (For/keyedRegion) defaults to identity keying;
    // List/createList key differently (e.g. keyExtractor) and use a different option shape — requiring
    // `each` avoids false-positives on those.
    if (hasKey || hasSpread || !hasEach) return
    emit(
      node,
      'MDC_PERF_002',
      `${name}() has no \`key\` — it defaults to object identity, so freshly-built rows never ` +
        'match and every row is disposed + recreated (or throws on a duplicate primitive). Add ' +
        'key: (item) => item.id (a stable id).',
    )
  }

  const ruleHeavyEffect = (node: ts.Node): void => {
    if (!ts.isCallExpression(node) || calleeName(node) !== 'effect') return
    // effect(fn, { priority: 'normal' }) is already deferred — exempt.
    if (node.arguments.length >= 2) return
    const fn = node.arguments[0]
    if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return
    if (hasHeavyWork(fn.body) && readsAccessor(fn.body)) {
      emit(
        node,
        'MDC_PERF_003',
        'Heavy synchronous work in a default (sync-lane) effect — it runs inline on every ' +
          'dependency write, blocking the interaction. Move derived values into computed()/memo() ' +
          "(lazy + cached), or run heavy work on the deferred lane: effect(fn, { priority: 'normal' }).",
      )
    }
  }

  const ruleRepeatedReadInLoop = (node: ts.Node): void => {
    let body: ts.Node | undefined
    if (
      ts.isForStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isWhileStatement(node)
    ) {
      body = node.statement
    } else if (
      ts.isCallExpression(node) &&
      (propAccessName(node) === 'map' || propAccessName(node) === 'forEach')
    ) {
      const cb = node.arguments[0]
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) body = cb.body
    }
    if (!body) return
    // Count zero-arg reads of each known accessor inside the loop body. A nested function resets the
    // scope (its reads run later, not per-iteration), so don't descend into one.
    const occ = new Map<string, { count: number; first: ts.Node }>()
    const walk = (n: ts.Node): void => {
      if (
        n !== body &&
        (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n))
      )
        return
      if (
        ts.isCallExpression(n) &&
        n.arguments.length === 0 &&
        ts.isIdentifier(n.expression) &&
        accessors.has(n.expression.text)
      ) {
        const id = n.expression.text
        const e = occ.get(id)
        if (e) e.count++
        else occ.set(id, { count: 1, first: n })
      }
      ts.forEachChild(n, walk)
    }
    walk(body)
    for (const [id, e] of occ) {
      if (e.count >= 2) {
        emit(
          e.first,
          'MDC_PERF_004',
          `\`${id}()\` is read ${e.count}× inside a loop — each call re-reads the signal. Hoist ` +
            `it once above the loop: const v = ${id}().`,
        )
      }
    }
  }

  const ruleEffectNoCleanup = (node: ts.Node): void => {
    if (!ts.isCallExpression(node) || calleeName(node) !== 'effect') return
    const fn = node.arguments[0]
    if (!fn || (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn))) return
    let subscribes = false
    let hasCleanup = false
    const look = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const nm = ts.isIdentifier(n.expression) ? n.expression.text : propAccessName(n)
        if (SUBSCRIBE_CALLS.test(nm)) subscribes = true
        if (ts.isIdentifier(n.expression) && n.expression.text === 'onCleanup') hasCleanup = true
      }
      // a `return <function>` inside the effect body is a teardown
      if (
        ts.isReturnStatement(n) &&
        n.expression &&
        (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression))
      )
        hasCleanup = true
      ts.forEachChild(n, look)
    }
    look(fn.body)
    if (subscribes && !hasCleanup) {
      emit(
        node,
        'MDC_PERF_005',
        'effect() subscribes to an external source but returns no cleanup — the listener leaks ' +
          'when the scope disposes. Return a teardown function or call onCleanup(() => …).',
      )
    }
  }

  const ruleConstFunctionStyle = (node: ts.Node): void => {
    if (!ts.isJsxAttribute(node) || !node.initializer) return
    if (!ts.isJsxExpression(node.initializer) || !node.initializer.expression) return
    const expr = node.initializer.expression
    if (!ts.isArrowFunction(expr) || ts.isBlock(expr.body)) return
    let body: ts.Expression = expr.body
    while (ts.isParenthesizedExpression(body)) body = body.expression // `() => ({...})` parens
    if (!ts.isObjectLiteralExpression(body) && !ts.isArrayLiteralExpression(body)) return
    // It allocates a reactive binding (an effect) for a value that never changes (no accessor read).
    if (!readsAccessor(body)) {
      emit(
        node,
        'MDC_PERF_006',
        'A function-valued prop that returns a constant object/array reads no signal — it allocates ' +
          'a reactive binding for a value that never changes. Pass the literal directly (style={{…}}).',
      )
    }
  }

  const ruleLargeLiteralList = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const count = node.children.filter(
        (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c),
      ).length
      if (count >= threshold)
        emit(
          node,
          'MDC_PERF_007',
          `${count} static child elements rendered inline — consider List({...}) virtualization for large lists.`,
        )
    } else if (ts.isArrayLiteralExpression(node)) {
      const count = node.elements.filter(
        (c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c),
      ).length
      if (count >= threshold)
        emit(
          node,
          'MDC_PERF_007',
          `${count} JSX elements in an array literal — consider For/List for large lists.`,
        )
    }
  }

  const visit = (node: ts.Node): void => {
    ruleMapJsxChild(node)
    ruleMissingKey(node)
    ruleHeavyEffect(node)
    ruleRepeatedReadInLoop(node)
    ruleEffectNoCleanup(node)
    ruleConstFunctionStyle(node)
    ruleLargeLiteralList(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}
