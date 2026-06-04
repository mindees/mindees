#!/usr/bin/env node

/**
 * Lightweight benchmark evidence for already-implemented MindeesNative claims.
 *
 * This is intentionally dependency-free and non-gating: timings vary by machine, but
 * each case asserts core correctness while reporting reproducible throughput evidence
 * from built package artifacts.
 */

import { existsSync } from 'node:fs'
import { arch, cpus, platform, release } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const samples = readPositiveIntegerEnv('BENCHMARK_SAMPLES', 5)
const iterationMultiplier = readPositiveNumberEnv('BENCHMARK_ITERATIONS_MULTIPLIER', 1)
const outputJson = process.argv.includes('--json')

const modules = {
  core: () => loadDist('core'),
  data: () => loadDist('data'),
  router: () => loadDist('router'),
  renderer: () => loadDist('renderer'),
  atlasList: () => loadDist('atlas', 'list'),
  updates: () => loadDist('updates'),
}

const cases = [
  {
    id: 'core.signal.isolated-update',
    packageName: '@mindees/core',
    claim: 'fine-grained signals update only the subscribed observer',
    iterations: 25_000,
    sample: sampleCoreSignalIsolation,
  },
  {
    id: 'data.collection.record-update',
    packageName: '@mindees/data',
    claim: 'record reads are signals-native and per-record isolated',
    iterations: 15_000,
    sample: sampleDataRecordUpdate,
  },
  {
    id: 'router.pattern.match-build',
    packageName: '@mindees/router',
    claim: 'codegen-free route pattern matching and path building',
    iterations: 120_000,
    sample: sampleRouterPatternOps,
  },
  {
    id: 'renderer.native-command.reactive-prop',
    packageName: '@mindees/renderer',
    claim: 'reactive prop updates emit a narrow native command stream',
    iterations: 15_000,
    sample: sampleNativeCommandPropUpdate,
  },
  {
    id: 'atlas.list.compute-window',
    packageName: '@mindees/atlas/list',
    claim: 'virtualized list windowing is pure fixed-height math',
    iterations: 250_000,
    sample: sampleAtlasWindowMath,
  },
  {
    id: 'updates.delta.apply',
    packageName: '@mindees/updates',
    claim: 'OTA delta apply is deterministic and allocation-bounded by output size',
    iterations: 4_000,
    sample: sampleUpdateDeltaApply,
  },
]

const results = []

for (const bench of cases) {
  const iterations = Math.max(1, Math.round(bench.iterations * iterationMultiplier))
  await bench.sample(Math.max(1, Math.min(100, iterations)))

  const durations = []
  let note = ''
  for (let i = 0; i < samples; i++) {
    globalThis.gc?.()
    const result = await bench.sample(iterations)
    durations.push(result.durationMs)
    note = result.note
  }

  const medianMs = median(durations)
  const minMs = Math.min(...durations)
  const maxMs = Math.max(...durations)
  const safeMedianMs = Math.max(medianMs, Number.EPSILON)
  results.push({
    id: bench.id,
    packageName: bench.packageName,
    claim: bench.claim,
    iterations,
    samples,
    medianMs,
    minMs,
    maxMs,
    opsPerSecond: iterations / (safeMedianMs / 1000),
    note,
  })
}

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  os: `${platform()} ${release()} ${arch()}`,
  cpu: cpus()[0]?.model ?? 'unknown',
  samples,
  iterationMultiplier,
  results,
}

if (outputJson) {
  console.log(JSON.stringify(summary, null, 2))
} else {
  printMarkdown(summary)
}

async function sampleCoreSignalIsolation(iterations) {
  const { createRoot, effect, signal } = await modules.core()
  return createRoot((dispose) => {
    const width = 1_000
    const targetIndex = Math.floor(width / 2)
    const signals = Array.from({ length: width }, (_, i) => signal(i))
    const runs = new Array(width).fill(0)
    for (let i = 0; i < width; i++) {
      const current = signals[i]
      if (!current) throw new Error(`missing signal ${i}`)
      effect(() => {
        current()
        runs[i]++
      })
    }

    const target = signals[targetIndex]
    if (!target) throw new Error('missing target signal')
    const start = performance.now()
    for (let i = 0; i < iterations; i++) target.set(width + i)
    const durationMs = performance.now() - start

    assertEqual(runs[targetIndex], iterations + 1, 'target effect run count')
    assertEqual(runs[0], 1, 'unrelated effect run count')
    dispose()
    return {
      durationMs,
      note: `${width} signal/effect pairs; unrelated observer stayed at one run`,
    }
  })
}

async function sampleDataRecordUpdate(iterations) {
  const { createRoot, effect } = await modules.core()
  const { createCollection } = await modules.data()
  return createRoot((dispose) => {
    const recordCount = 5_000
    const targetId = Math.floor(recordCount / 2)
    const collection = createCollection({
      initial: Array.from({ length: recordCount }, (_, id) => ({ id, value: 0, group: id % 10 })),
    })
    let runs = 0
    let last = 0
    effect(() => {
      last = collection.get(targetId)?.value ?? -1
      runs++
    })

    const start = performance.now()
    for (let i = 0; i < iterations; i++) collection.update(targetId, { value: i + 1 })
    const durationMs = performance.now() - start

    assertEqual(runs, iterations + 1, 'record effect run count')
    assertEqual(last, iterations, 'record final value')
    dispose()
    return {
      durationMs,
      note: `${recordCount} seeded records; one subscribed record updated`,
    }
  })
}

async function sampleRouterPatternOps(iterations) {
  const { buildPath, matchPattern } = await modules.router()
  const patterns = [
    '/projects/:projectId/tasks/:taskId',
    '/teams/:teamId/members/:memberId',
    '/docs/:rest*',
    '/settings/profile',
  ]
  const paths = [
    '/projects/p-123/tasks/t-456',
    '/teams/core/members/aashir',
    '/docs/guides/native/command-stream',
    '/settings/profile',
  ]

  let checksum = 0
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    const index = i % patterns.length
    const pattern = patterns[index]
    const path = paths[index]
    const params = matchPattern(pattern, path)
    if (!params) throw new Error(`pattern did not match: ${pattern} ${path}`)
    checksum += Object.keys(params).length
    const built = buildPath('/projects/:projectId/tasks/:taskId', {
      projectId: `p-${i % 997}`,
      taskId: `t-${i % 431}`,
    })
    checksum += built.length
  }
  const durationMs = performance.now() - start

  if (checksum <= 0) throw new Error('router benchmark checksum did not advance')
  return { durationMs, note: 'mix of static, dynamic, and catch-all patterns' }
}

async function sampleNativeCommandPropUpdate(iterations) {
  const { createElement, signal } = await modules.core()
  const { createNativeCommandBackend, render } = await modules.renderer()
  const count = signal(0)
  const backend = createNativeCommandBackend()
  const mounted = render(
    createElement('view', { title: () => `count-${count()}` }, 'static'),
    backend,
    backend.root,
  )
  backend.clearCommands()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) count.set(i + 1)
  const durationMs = performance.now() - start

  const commands = backend.getCommands()
  assertEqual(commands.length, iterations, 'native setProp command count')
  for (const command of commands) {
    if (command.type !== 'setProp' || command.name !== 'title') {
      throw new Error(`unexpected native command ${JSON.stringify(command)}`)
    }
  }
  mounted.dispose()
  return { durationMs, note: 'one reactive prop produced one setProp command per write' }
}

async function sampleAtlasWindowMath(iterations) {
  const { computeWindow } = await modules.atlasList()
  const itemCount = 100_000
  const itemHeight = 48
  const viewportHeight = 720
  const maxScroll = itemCount * itemHeight - viewportHeight
  let checksum = 0

  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    const window = computeWindow((i * 97) % maxScroll, viewportHeight, itemHeight, itemCount, 4)
    checksum += window.startIndex + window.endIndex + window.totalHeight
  }
  const durationMs = performance.now() - start

  if (checksum <= 0) throw new Error('list window checksum did not advance')
  return { durationMs, note: `${itemCount} items, fixed ${itemHeight}px rows, overscan 4` }
}

async function sampleUpdateDeltaApply(iterations) {
  const { applyDelta, diff } = await modules.updates()
  const base = new Uint8Array(32 * 1024)
  for (let i = 0; i < base.length; i++) base[i] = (i * 31) % 251
  const target = base.slice()
  for (let i = 0; i < target.length; i += 257) target[i] = (target[i] + 17) % 256
  const delta = diff(base, target)

  let checksum = 0
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    const out = applyDelta(base, delta, { maxBytes: target.length })
    checksum += out[(i * 131) % out.length] ?? 0
  }
  const durationMs = performance.now() - start

  const out = applyDelta(base, delta, { maxBytes: target.length })
  assertBytesEqual(out, target, 'delta round trip')
  if (checksum < 0) throw new Error('delta checksum impossible state')
  return {
    durationMs,
    note: `${formatBytes(base.length)} base, ${formatBytes(delta.length)} delta`,
  }
}

async function loadDist(packageDir, entry = 'index') {
  const file = join(root, 'packages', packageDir, 'dist', `${entry}.js`)
  if (!existsSync(file)) {
    throw new Error(
      `Missing built artifact ${file}. Run "pnpm build" first or use "pnpm benchmark".`,
    )
  }
  return import(pathToFileURL(file).href)
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
}

function assertBytesEqual(actual, expected, label) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: expected length ${expected.length}, received ${actual.length}`)
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(`${label}: byte ${i} expected ${expected[i]}, received ${actual[i]}`)
    }
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}

function readPositiveIntegerEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received ${JSON.stringify(raw)}`)
  }
  return value
}

function readPositiveNumberEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, received ${JSON.stringify(raw)}`)
  }
  return value
}

function printMarkdown(summary) {
  console.log('# MindeesNative Benchmark Evidence')
  console.log('')
  console.log(`Generated: ${summary.generatedAt}`)
  console.log(`Node: ${summary.node}`)
  console.log(`OS: ${summary.os}`)
  console.log(`CPU: ${summary.cpu}`)
  console.log(`Samples: ${summary.samples}`)
  console.log(`Iteration multiplier: ${summary.iterationMultiplier}`)
  console.log('')
  console.log(
    markdownTable([
      ['Case', 'Package', 'Iterations/sample', 'Median', 'Ops/sec', 'Range', 'Note'],
      ...summary.results.map((result) => [
        result.id,
        result.packageName,
        formatNumber(result.iterations),
        `${result.medianMs.toFixed(2)} ms`,
        formatNumber(Math.round(result.opsPerSecond)),
        `${result.minMs.toFixed(2)}-${result.maxMs.toFixed(2)} ms`,
        result.note,
      ]),
    ]),
  )
}

function markdownTable(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  )
  return rows
    .map((row, index) => {
      const line = `| ${row
        .map((cell, column) => String(cell ?? '').padEnd(widths[column]))
        .join(' | ')} |`
      if (index !== 0) return line
      return `${line}\n| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`
    })
    .join('\n')
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}
