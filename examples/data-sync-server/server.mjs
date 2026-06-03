// Runnable node:http adapter for the Continuum reference sync server.
//
// The selection/append/serve logic lives in @mindees/data/server (createSyncServer over
// an injected op log) and is unit-tested there; this file is ONLY the I/O wiring. In a
// real deployment you would back createMemoryOpLog with a database / object store.
//
// Run: pnpm --filter @mindees/data build && pnpm --filter @mindees/example-data-sync-server start

import { createServer } from 'node:http'
import { createMemoryOpLog, createSyncServer } from '@mindees/data/server'

const server = createSyncServer({ log: createMemoryOpLog() })
const PORT = Number(process.env.PORT ?? 4500)

const httpServer = createServer((req, res) => {
  void handle(req, res).catch((err) => json(res, 500, { error: String(err) }))
})

async function handle(req, res) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  // POST /sync/push  — body: an array of ops → { acked }
  if (req.method === 'POST' && url.pathname === '/sync/push') {
    const body = await readJson(req)
    json(res, 200, await server.push(Array.isArray(body) ? body : []))
    return
  }

  // GET /sync/pull?cursor=  → { ops, cursor }
  if (req.method === 'GET' && url.pathname === '/sync/pull') {
    const raw = url.searchParams.get('cursor')
    const cursor = raw === null || !/^\d+$/.test(raw) ? null : Number(raw)
    json(res, 200, await server.pull(cursor))
    return
  }

  res.writeHead(404)
  res.end()
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : [])
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function json(res, code, value) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

httpServer.listen(PORT, () => {
  console.log(`Continuum reference sync server: http://localhost:${PORT}`)
  console.log(`  POST /sync/push   (body: Op[])  → { acked }`)
  console.log(`  GET  /sync/pull?cursor=N        → { ops, cursor }`)
})
