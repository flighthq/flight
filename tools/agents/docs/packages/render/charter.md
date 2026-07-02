---
package: '@flighthq/render'
crate: flighthq-render
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# render — Charter

## What it is

`@flighthq/render` is the **backend-agnostic render core**: the contracts and CPU-side preparation that every concrete backend consumes, with none of the backend draw code itself.

It owns renderer registration (the `*Kind`→renderer registry), render state, the scene-graph→render-proxy update/prepare pipeline, the render-cache seam, render-target geometry math, viewport culling, a retained sortable render queue, the 3D scene-prepare (cull/light-pack) pass, and a counter-level stats snapshot. Every public type lives in `@flighthq/types` first; this package implements against that header.

Where it ends: the concrete per-backend draw loops, batching, target pools, and shaders live in the sibling backend packages (`displayobject-canvas`, `displayobject-dom`, `displayobject-gl`, `displayobject-wgpu`, and the `scene-<backend>` leaves). `render` is the seam those backends register into and the preparation they all draw from. It is also distinct from the scene-graph packages it reads (`node`, `displayobject`, `sprite`, `scene`): it consumes prepared graph state, it does not define node types.

## North star

1. **Contracts and preparation, not pixels.** The core owns the renderer registry, the prepare pipeline, and the draw/submit/flush contract; concrete drawing stays in the backend packages. A feature belongs here only if every backend needs it and it can be expressed without touching a specific GPU API.
2. **Types-first, header-driven.** Every cross-package render type is defined in `@flighthq/types` before it is implemented here, with ownership/aliasing/coordinate-space comments. The header is the design surface; the seam names this package introduces are the conformance contract the `flighthq-render` crate mirrors 1:1.
3. **Registry by default at the backend seam.** Backend contributions are registered, not switched (`registerRenderer`, `registerRenderBatchFlush`, last-write-wins). A closed struct compare is permitted only in the tight inner submit loop (`batchKeysEqual`); the set it keys over stays open via the registry.
4. **No hidden per-frame allocation, no shared top-level state.** Hot paths reuse grow-but-never-shrink scratch (the render queue, stacks); mutable state lives on `RenderStateRuntime`, not module globals, so multiple render states coexist independently. Allocation is explicit and named.
5. **3D is strictly additive.** The 3D scene-prepare path composes the shared substrate without a 2D app ever reaching it; a 2D bundle pays nothing for 3D.

## Boundaries

**In scope:**

- Renderer registration and the render state that holds it.
- The scene-graph→render-proxy prepare/update pipeline (transform, color, appearance, material, clip propagation).
- The shared draw driver (`drawRenderProxy`/`submitRenderProxy`/`flushRenderBatch`) and the per-`BatchFormat` flush registry.
- The retained sortable render queue.
- Render-target geometry math, blend save/restore, 2D viewport culling using real world bounds.
- The 3D scene-prepare pass at the contract level (frustum cull, light packing for GPU — consuming light descriptors from `@flighthq/lighting`).
- Counter-level render stats as a diagnostics seam.
- A render-pass / render-graph abstraction as an optional higher-level layer for custom backend authors (whether or not the default backends use it).

**Non-goals:**

- Concrete per-backend draw loops, batching internals, GPU target pools, and shaders — those are the backend packages.
- Node-type definitions — those belong to `node` / `displayobject` / `sprite` / `scene`.
- CSS / platform font-string building — `computeTextFormatFontString` moves to `@flighthq/text` (Decision #3).
- The objective definition of lighting (light types, light descriptors) — that belongs to `@flighthq/lighting`. This package consumes lighting descriptors and composes them for the GPU.

## Decisions

- **[2026-07-02] The core owns a shared draw driver — backends contribute leaf `submit` calls.** `render` owns the walk-and-flush loop: `drawRenderProxy(state, root)` walks prepared proxies, dispatches `renderer.submit(state, proxy)`, and auto-flushes on batch-key change via `registerRenderBatchFlush(state, format, flush)`. Backends implement the leaf `submit` on their `Renderer` and register a flush callback; they do not re-implement the walk. The `Renderer.submit`/`format` contract already implies this — the driver is the missing implementation. **Resolves Open direction #1.**

  **Why:** Four backends each re-deriving the walk is pure duplication. The `submit`/`format` contract on `Renderer` was designed for a shared driver; building it is completing the design, not adding abstraction. The `displayobject-gl`/`displayobject-wgpu` leaf renderers should be built against this driver, not before it.

- **[2026-07-02] Render-pass / render-graph is in scope for `render`, as an optional abstraction.** The SDK is large enough that custom backend authors will look for a render graph. With WebGL and WebGPU backends, a backend-agnostic pass/target descriptor carries real weight. Whether the default backends use it is a separate question — the abstraction should exist for those who want it. Not a separate package. **Resolves Open directions #2 and #3.**

  **Why:** A render graph is a natural extension of the render core's "what to draw and in what order" identity. Splitting it into `render-graph` would force an artificial seam — the graph needs intimate access to render state, the queue, and the target math that already live here. Keeping it in `render` keeps it composable and optional (tree-shaking ensures a 2D app that doesn't import graph functions pays nothing).

- **[2026-07-02] `computeTextFormatFontString` moves to `@flighthq/text`.** It is a CSS font-string builder — a scope leak in the render core. The move touches ~14 import sites across `displayobject-canvas`, `displayobject-dom`, `displayobject-gl`, `displayobject-wgpu`, and `textshaper-canvas`. **Resolves Open direction #5.**

  **Why:** Font-string building is text-domain logic. The render core has no business knowing CSS font syntax. Every consumer already imports from backend packages that can depend on `@flighthq/text`.

- **[2026-07-02] 3D prepare boundary: render composes, lighting defines.** `@flighthq/lighting` owns the objective definition of lights (types, descriptors, properties). `@flighthq/render` owns the composition/prepare side: frustum culling, packing light descriptors into GPU-ready blocks, draw-order/material sort. Render consumes light descriptors and composes them for the GPU — it does not define what a light is. **Resolves Open direction #6.**

  **Why:** Separation of concerns. A light is a scene-graph entity with physical properties (intensity, color, range, shadow configuration). How those properties are packed into a uniform buffer for a GPU pass is a render concern. The boundary is: definitions in `lighting`, composition in `render`.

- **[2026-07-02] Viewport culling must use real world bounds, cache-aware.** `computeRenderProxyWorldBounds` currently writes local `x/y` with zero size — not real world bounds. Fix it to use `getNodeWorldBoundsRectangle` from `@flighthq/node`, which returns the cached world-space AABB (the bounds system already dirty-tracks via revisions). The render transform (`state.renderTransform2D`) must also be accounted for when comparing against the viewport, since the viewport is in screen/device coordinates and world bounds are in scene-world coordinates. Use cached values from the bounds system rather than recomputing — this runs in a hot render loop. **Resolves Open direction #8 (viewport culling).**

  **Why:** The current implementation is silently wrong — it treats every node as a zero-size point at its local position, not its world position. Node already has the cached, revision-gated world bounds. Using them is correct and cheap (the bounds system already recomputes lazily). The render transform is the remaining piece: the prepare pass already composes `renderTransform2D` on each proxy, and the viewport cull should account for it.

- **[2026-07-02] Housekeeping: delete `beginRenderProxyUpdate`, collapse `updateDisplayObjectRenderTransform`, convert adapt hook to per-state.** Three mechanical cleanups: (a) `beginRenderProxyUpdate` is an exported no-op with no body and no callers — delete it; (b) `updateDisplayObjectRenderTransform` is a thin alias over `updateRenderProxy2DTransform` with no external callers — collapse it; (c) `installRenderAdaptHook` is a global slot (`_adaptHook` + `_installed` module-level flag) — convert to a per-state slot on `RenderStateRuntime` so multiple render states coexist independently. **Resolves Open direction #8 (contract-fit nits, partial).**

  **Why:** (a) An exported function with an empty body is API debt — it promises a hook that does nothing. (b) Two public names for one behavior adds surface with no value; the user-facing prepare pass calls `updateRenderProxy2D`, not this alias. (c) A global adapt hook violates the "no shared top-level mutable state" rule and means only one adapter can be installed process-wide.

## Open directions

1. **Retained queue as the driver's input.** `RenderQueue` exists (`buildRenderQueue`/`sortRenderQueue`) but `drawRenderProxy` re-walks the graph instead of consuming the sorted queue. A `drawRenderQueue(state, queue)` variant that drives draws from the pre-sorted queue is the natural next step — it would decouple sort order from traversal order. Settle after the driver lands.

2. **Diagnostics bar.** Counters exist conceptually but not as an exported seam. Full `RenderStats` (per-format/triangle/vertex counts), GPU-timer hooks, and `enableRenderProxySignals` debug capture — how much belongs in the core vs backends? Silver-tier.

3. **Render-pass / render-graph implementation.** In scope (Decision #2) but not yet designed. The render-pass descriptor must reconcile with what `render-gl` and `render-wgpu` already do for begin/end-target. The frame graph (transient-target aliasing, compile/execute) is Gold-tier. Needs its own design pass.

4. **3D prepare depth.** Currently: one directional + one ambient light, frustum cull. Point/spot lights, shadow-caster collection, material sort, instancing batching, LOD — these are real gaps but gated on the `scene`/`lighting`/`mesh` roadmap. Do not build unilaterally.

5. **Blend save/restore stack.** `pushRenderBlendState`/`popRenderBlendState` for nested blend groups and isolated layers. Additive, in-package. Silver-tier.

6. **`flighthq-render` Rust crate parity.** Mirror the driver, queue, pass, and frame-graph seams 1:1. Large, separate workstream — follows TS settling, not leads.

7. **`RenderBatchKey` homing and `getRenderStateStats` snapshot honesty.** When the driver/stats types land, `RenderBatchKey` should be in its own file (not inline in `RenderDrawContext`), and `getRenderStateStats` should return a true snapshot, not a narrowed live reference. Minor contract hygiene.
