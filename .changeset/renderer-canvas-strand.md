---
"@mindees/renderer": minor
---

Add the **Helix Canvas strand** (spec §6.2) — `createCanvas2DBackend()`, a retained-mode 2D scene
graph driven by the SAME reconciler as the native/DOM strands. Build a `canvas-rect`/`canvas-circle`/
`canvas-line`/`canvas-text`/`canvas-group` subtree with fine-grained reactivity, then `paint(ctx, w, h)`
rasterizes it to any `Scene2DContext` (a real `CanvasRenderingContext2D` satisfies it on web; a WebGPU
rasterizer can drive the same scene graph later). This is the Flutter-grade pixel-control advantage —
opt-in, per-subtree — without bolting on Skia (RN) or losing native components (Flutter).
