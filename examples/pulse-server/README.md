# Pulse reference update server

A runnable `node:http` adapter for the **Pulse** update server core
([`@mindees/updates/server`](../../packages/updates/src/server.ts)).

The selection logic — channel matching, staged rollout, anti-downgrade, freeze
(expiry), and rollback directives — lives in the pure, unit-tested
`createUpdateServer` core. This example is **only the HTTP wiring**: it shows how a
host exposes that core over the network. See
[ADR-0010](../../docs/adr/0010-pulse-reference-server.md).

> **The server never signs.** Signing is an offline build step — only **pre-signed**
> manifests are published to the server, and only the **public** key is embedded in
> your app. This example generates a key and signs one release at startup purely so it
> runs standalone.

## Run

```bash
pnpm --filter @mindees/updates build      # build the package the example imports
pnpm --filter @mindees/example-pulse-server start
```

Then:

```bash
# A client on v1 is offered the v2 release:
curl "http://localhost:4000/api/updates?runtimeVersion=1.0.0&currentVersion=1"
# → {"type":"update","signed":{"manifest":"…","signatures":[…]}}

# A client already on v2 is up to date:
curl "http://localhost:4000/api/updates?runtimeVersion=1.0.0&currentVersion=2"
# → {"type":"no-update"}

# Fetch an asset (or delta blob) by its SHA-256:
curl "http://localhost:4000/api/assets/<sha256>" --output index.js
```

## Endpoints

| Method & path | Returns |
| --- | --- |
| `GET /api/updates?runtimeVersion&channel&currentVersion&rolloutKey` | An `UpdateResolution`: `{type:'update', signed}` \| `{type:'no-update'}` \| `{type:'roll-back-to-embedded'}` |
| `GET /api/assets/<sha256>` | The asset bytes (`application/octet-stream`), or `404` |

## Client integration note

The current [`UpdateClient`](../../packages/updates/src/client.ts) consumes the
**`update`** case directly (its `fetchManifest` returns the `SignedManifest`). Teaching
`check()` to also act on the `no-update` / `roll-back-to-embedded` directives is a
planned client-protocol extension — until then those directives are advisory.
