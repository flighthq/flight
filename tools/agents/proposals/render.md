---
id: render
title: '@flighthq/render'
type: depth
target: render
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/render.md
  - tools/agents/docs/reviews/depth/render.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 74/100. A deliberate, well-factored render _core_ that owns preparation, registration, the proxy/update pipeline, caching, and target math with strong tests, but is one major piece short of authoritative: it does not own the backend-agnostic _draw/submit driver_ its own `Renderer.submit` / `BatchFormat` contract implies, and has no render-queue or render-pass abstraction.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable draw driver and the housekeeping the depth review flagged. This is the 20% that turns a "prepare-only" core into a core a backend can actually drive a frame through.

- **`@flighthq/types` first** — add the driver/queue value types as the header layer:
  - `RenderBatchKey` (the flush key: `{ format: BatchFormat; texture; blend: BlendMode; material }`) and `BatchBarrier` sentinel referenced by `BatchFormat.ts` but not yet defined.
  - `RenderDrawContext` — the per-frame driver scratch a backend passes through `submit` (current open-batch key, draw/flush counters), kept as plain data on the runtime.
- **`drawRenderProxy(state, source, out?)`** — the shared, dirty-aware draw walk over already-prepared proxies: visits visible proxies in scene order, dispatches `renderer.submit(state, proxy)`, and on a `BatchFormat`/key change calls the registered flush hook. This is the function the four backends were each expected to re-implement. (Free function, out-param for the draw context; no allocation in the hot path.)
- **`flushRenderBatch(state)`** + **`registerRenderBatchFlush(state, format, flush)`** — the flush seam keyed by `BatchFormat`, so immediate-mode and batched backends share one auto-flush rule. `submitRenderProxy(state, proxy)` as the single-node entry the walk and backends both call (auto-flush on key change).
- **Remove API debt named in the depth review**:
  - Delete the exported no-op `beginRenderProxyUpdate` (`{}`) — reserved hook with no body.
  - Collapse the `updateDisplayObjectRenderTransform` alias into `updateRenderProxy2DTransform` (two public names, one behavior).
  - Relocate `computeTextFormatFontString` out of the render core into `@flighthq/text` (or a backend); it is a CSS font-string builder, a scope leak here.
- **Replace the global adapt hook** (`_adaptHook` + `installRenderAdaptHook`) with a per-state slot on `RenderStateRuntime` (`renderAdaptHook`), so multiple states/adapters coexist and the "no shared top-level mutable state" rule holds. Keep `installRenderAdaptHook(state, fn)` signature parity.
- **`getRenderStateStats(state)` (minimal)** — expose the draw/flush counters the driver already maintains (`drawCallCount`, `flushCount`, `proxyVisitedCount`) as a read-only snapshot. Cheap, and the natural home now that the driver owns the walk.

### Silver

Competitive and solid: a retained, sortable queue; the render-pass/target abstraction the backends each reinvent; and the 2D culling parity the 3D path already has.

- **Retained render queue** (`@flighthq/types`: `RenderQueue`, `RenderQueueEntry`, `RenderLayer`):
  - `createRenderQueue(out?)`, `pushRenderQueueEntry(queue, proxy, sortKey)`, `clearRenderQueue(queue)`, `sortRenderQueue(queue, compare?)`.
  - `buildRenderQueue(state, source, out)` — fills a queue from a prepared subtree so draw order is data, not implicit traversal. Default sort preserves scene order; opt-in opaque/transparent partition and an explicit `layer`/`order` key.
  - `RenderSortKey` packing (layer, depth, blend, texture) and `compareRenderQueueEntries` so backends can coalesce batches by sort.
- **Backend-agnostic render-pass / attachment descriptor** (`@flighthq/types`: `RenderPassDescriptor`, `RenderAttachment`, `LoadOp`/`StoreOp`, `ClearValue`) over the existing `RenderTargetDescriptor`:
  - `beginRenderPass(state, pass)` / `endRenderPass(state)` as the core contract the backends fill (today each reinvents `beginGlRenderTarget` / `beginWgpuRenderTarget`).
  - `computeRenderPassViewport` / `computeRenderPassScissor` helpers (pure, out-param) pairing with the existing `renderTarget.ts` math.
- **2D viewport/scissor culling** — bring the 2D path to the 3D path's parity:
  - `isRenderProxyInViewport(proxy, viewport)` using the node's world-space bounds (`HasBoundsRectangle` already present), and a `cullViewport` field threaded through `drawRenderProxy` so offscreen 2D subtrees are skipped, not just invisible ones.
  - `computeRenderProxyWorldBounds(out, proxy)` (alias-safe) as the bounds the cull and `renderTarget` math share.
- **Blend/alpha save-restore stack** — promote the single `renderBlendMode`/`renderAlpha` root override to an explicit stack the driver pushes/pops across clip and group boundaries: `pushRenderBlendState(state)` / `popRenderBlendState(state)`, so nested blend groups and isolated layers compose correctly across backends.
- **Render-effect / filter substitution through the adapt seam** — formalize the `RenderEffect` type (already stubbed in types) as the data descriptor the adapt hook reads to substitute a cache/filter renderer, so `cacheAsBitmap` and filter passes share one mechanism. `applyRenderEffect(state, proxy, effect)`.
- **Cross-backend consistency tests** — a render-core parity suite asserting that a prepared queue produces the same draw-call sequence (counts, order, flush boundaries) independent of backend, using a recording stub `Renderer`. This is the consistency gate the package currently lacks.

### Gold

Authoritative / AAA: a frame graph, the full 3D prepare bar, performance instrumentation, exhaustive error/edge handling, and 1:1 Rust-port parity.

- **Frame-graph / multi-pass dependency description** (`@flighthq/types`: `RenderGraph`, `RenderGraphNode`, `RenderResource`, transient-resource lifetimes):
  - `createRenderGraph()`, `addRenderGraphPass(graph, pass, reads, writes)`, `compileRenderGraph(graph, out)` (topo-sort + transient target aliasing using `renderTarget.ts` sizing), `executeRenderGraph(state, graph)`.
  - Transient render-target pool seam shared with the backends' existing target pools (`render-gl` already has `glRenderTargetPool`).
- **3D prepare to the authoritative bar** (extends `sceneRender.ts`):
  - Point and spot lights (`SceneLightBlock` beyond the single directional+ambient `LIGHT_BLOCK_FLOATS = 12`), light culling, and a `SceneLightList`.
  - Shadow-caster collection pass (`collectSceneShadowCasters`), draw-order/material sort (`sortSceneRenderList` front-to-back opaque, back-to-front transparent), GPU instancing batching (`batchSceneRenderInstances`), and LOD selection (`selectSceneLod`). (Coordinate with the `scene` roadmap — flagged as deliberately under-built; surface as a cross-package decision.)
- **Performance & diagnostics seam**:
  - `RenderStats` (full: draw calls, triangles, batches, flushes, culled count, prepared/visited proxies, per-format breakdown) and per-frame CPU timing markers (`beginRenderTimer`/`endRenderTimer`).
  - A debug capture seam (`enableRenderProxySignals` group via `@flighthq/signals`) emitting prepare/draw/flush events for tooling, opt-in per the `enable*` convention.
  - GPU-timer-query hook contract (`RenderTimerBackend` with `get*/set*/createWeb*`) so backends report GPU time through one seam.
- **Exhaustive edge & error handling** — documented alias-safety on every new out-param function; sentinel returns (`null`/`-1`) for missing renderer/cache/queue lookups, throwing only on misuse (e.g. `flushRenderBatch` with no open batch is a no-op, not a throw); dirty-tracking correctness under registry hot-swap mid-frame; re-entrancy guard on `tempStack` reuse now that both prepare and draw walks share it (give the draw walk its own scratch or document the bracket).
- **`flighthq-render` Rust crate parity** — mirror the driver, queue, pass, and frame-graph seams 1:1: `draw_render_proxy`, `flush_render_batch`, `RenderQueue`/`build_render_queue`, `RenderPassDescriptor`/`begin_render_pass`, `RenderGraph`/`compile_render_graph`, `KindId`-keyed registry, `Signal<T>` stats events. Record any intentional TS↔Rust divergence in the conformance map. The driver is the seam every Rust host (`host-winit`/`host-sdl`/`host-web`/`capture`) drives through `set_wgpu_frame_target_view` → background → draw walk → submit, so it is the highest-leverage crate to land for conformance.
- **Full docs** — a render-core architecture doc covering the prepare→queue→pass→draw→flush lifecycle, the batch-key/flush model, the adapt/effect seam, and the backend authoring contract (what a leaf renderer must implement: `createData`/`destroyData`/`submit`/`format`).

## Sequencing & effort

Recommended order, with dependencies and the items to surface before acting.

1. **Bronze housekeeping first (low effort, no deps)** — delete `beginRenderProxyUpdate`, collapse the `updateDisplayObjectRenderTransform` alias, move `computeTextFormatFontString` to `@flighthq/text`, and convert the global `_adaptHook` to a runtime slot. These are independent, reduce surface, and clear the deck before adding the driver. Run `npm run exports:check` / `npm run order` after. _Cross-package note: relocating `computeTextFormatFontString` touches `@flighthq/text` and any backend importing it — surface as a small cross-package move, not autonomous, since it crosses a package boundary._

2. **Bronze driver (medium effort; the keystone)** — define `RenderBatchKey` / `BatchBarrier` / `RenderDrawContext` in `@flighthq/types` first (header-layer rule), then `drawRenderProxy` + `submitRenderProxy` + `flushRenderBatch` + `registerRenderBatchFlush`, then the minimal `getRenderStateStats`. Depends on nothing outside this package and `@flighthq/types`. _This should land before the `displayobject-gl` / `displayobject-wgpu` leaf renderers are built, so they contribute leaf `submit` calls into the shared driver rather than re-deriving the walk — flag the ordering to whoever owns those packages._

3. **Silver queue, then pass, then cull (medium→high)** — the retained `RenderQueue` builds on the Bronze driver (the driver consumes a queue once it exists). The render-pass descriptor depends on the existing `renderTarget.ts` math and must be reconciled with `render-gl`'s `glRenderTarget`/`glRenderTargetPool` and `render-wgpu`'s targets — _surface as a design decision: the core pass descriptor must subsume what the two GPU cores already do, so this is a coordinated change across `render`, `render-gl`, `render-wgpu`._ 2D culling and the blend stack are local to this package. The cross-backend parity test suite should land alongside the queue so consistency is gated from the start.

4. **Gold frame graph + 3D + Rust (high effort)** — the frame graph depends on the Silver pass descriptor and the transient-target pool seam (coordinate with backend pools). The 3D prepare bar is gated on the `scene`/`mesh`/`lighting` roadmap — _do not build point/spot lights, shadows, or instancing here unilaterally; surface to the user as it crosses into the `scene` package's intended scope._ The Rust `flighthq-render` crate mirror should follow the TS driver/queue/pass seams settling, not lead them, since TS is authoritative; once stable it is the top conformance priority because every Rust host drives the same path.

**Net**: Bronze is achievable in one focused session (housekeeping + driver). Silver is the larger lift and the point where this package becomes genuinely competitive as a render core, but it requires coordination with `render-gl` / `render-wgpu` on the pass/target seam. Gold's frame graph and Rust parity are real multi-session efforts; the 3D-prepare portion is intentionally deferred to the `scene` roadmap and should be raised, not assumed.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/render` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
