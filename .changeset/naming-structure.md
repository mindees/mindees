---
"@mindees/renderer": minor
"@mindees/updates": minor
---

1.0 naming + surface cleanup (from the freeze audit):

- **`@mindees/renderer`:** the GPU research-stub backend is renamed `createCanvasBackend`/`CanvasBackend` →
  **`createGpuCanvasBackend`/`GpuCanvasBackend`** so it no longer collides with the implemented 2D scene
  backend `createCanvas2DBackend`. `Canvas2DBackendOptions` is now exported (was an inline anonymous type).
- **`@mindees/updates`:** the low-level Ed25519/hash/hex primitives (`sign`/`verify`/`sha256Hex`/`toHex`/
  `fromHex`/`utf8`) are no longer exported from the package root — the public OTA workflow is
  `signManifest`/`verifySignedManifest`/`parseManifest`. `generateKeypair`/`getPublicKey`/`Keypair` remain.
