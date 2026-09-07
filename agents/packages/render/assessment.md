---
package: '@flighthq/render'
updated: 2026-09-07
basedOn: ./review.md
---

# render — Assessment

Sorted from the 2026-07-13 full survey (`review.md`). Refreshed 2026-09-07: all seven Approved entries have now landed — the guard/explain set and the 3D dirty short-circuit, previously still pending, are verified done. `RenderTarget` + `Viewport` exist as first-class primitives, `computeRenderTargetSize` has an out-parameter form, and `ApplicationRenderView` is built and tested. Remaining Recommended items are the duck-type sniff residual and `collectVisibleMeshes` stack conversion.

## Directed


1. **~~Make `RenderTarget` + device-pixel `Viewport` the allocation-free sub-target primitive.~~** — retired 2026-09-07. `RenderTarget` and `Viewport` are first-class Entity-backed types in `@flighthq/types`, with backend realizations (`GlRenderTarget`, `WgpuRenderTarget`, `CanvasRenderTarget`), `computeRenderTargetSize` with an out-parameter form, and `explainRenderTargetAxes` diagnostic.
2. **~~Treat viewport aspect as authoritative at draw time.~~** — retired 2026-08-05 (camera assessment). `prepareScene3DRender` accepts an authoritative draw-time aspect without mutating the camera.
3. **~~Keep `RenderState` as the explicit current command/destination context.~~** — retired 2026-08-05. Backend draw and registration operations take their render state explicitly, while mutable binding, registry, cache, queue, and scratch bookkeeping lives on `RenderStateRuntime` and its backend runtime extensions rather than leaking onto the public state entities; semantic configuration continues through named operations.
4. **Retire `RenderViewport2D` without inventing a false world-space replacement.** Its old rectangle is screen-space after an optional transform. Reuse `RectangleLike`/the picking rectangle where that is the real contract, or introduce a precisely named cull rectangle only if a distinct concept remains.

## Depth gaps

1. **Defer render-graph machinery until the attachment/pass contracts are proven.** Explicit pass inputs and outputs are needed now; a general render graph, occlusion system, and other scheduling machinery are later composition layers rather than current bedrock.
2. **Replace the prepared `Mesh[]` with a truthful draw-entry contract before scale features.** A
   backend-neutral entry should identify source node/render payload, world transform, optional
   instance-data + count, selected LOD + level, and prepared deformation identity. Entries are pooled
   privately on RenderState runtime; the public header exposes the read contract, not allocation/cache
   controls. This is the shared seam for draw, bounds, picking, shadows, and later acceleration.

## Recommended

Strictly sweep-safe: within `@flighthq/render`, no unresolved design decision.

- **Replace the `'pivotX' in source` duck-type sniff in `isSpatial2DNode` (`renderViewport.ts`).** The one residual of the approved world-bounds fix: the bounds computation, render-transform handling, inclusive-edge comment, and `createRectangle()` scratch all landed, but trait detection still keys off a single field name. Use proper `Spatial2DNode` narrowing (or the node package's trait predicate if one exists at review time).
- **~~Complete the chartered guard/explain set (Approved 2026-07-03).~~** — retired 2026-09-07. `enableRenderRegistryGuards`, `enableSceneRenderGuards`, `explainScene2DCoverage`, and `explainScene2DRender` are all shipped and tested.
- **~~Honor `sceneGraphSyncPolicy` in `prepareScene3DRender` (Approved 2026-07-09).~~** — retired 2026-09-07. `prepareScene3DRender` reads `state.sceneGraphSyncPolicy` and passes `refreshTransforms` to `collectVisibleMeshes`.
- ~~**Delete the dead `RenderTargetSizeOptions` export.**~~ Landed 2026-08-25.
- ~~**Fix the stale `drawDriver` comment.**~~ Landed 2026-08-25.
- **Convert `collectVisibleMeshes` (`sceneRender.ts`) to the package's explicit-stack walk pattern.** Every other traversal here (`walkNode`, `walkRenderSubtree`, `buildRenderQueue`) is iterative; the 3D collect is the lone call-stack recursion — align it for consistency and deep-scene safety.
- **~~Give `computeRenderTargetSize` an `out`-parameter form.~~** — retired 2026-09-07. The function already takes `out: { width: number; height: number }` as its first parameter.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Shared draw driver (`drawRenderProxy`/`submitRenderProxy`/`flushRenderBatch`/`registerRenderBatchFlush`).** Charter Decision #1 blessed it; the keystone item and the consumer that redeems the currently-unconsumed queue/viewport seams. Needs the orphaned `RenderDrawContext`/`RenderStateStats` header types finished and coordination with the backend leaf renderers. Separate dispatch.
- **Resolve the orphaned header types (`RenderDrawContext`, `RenderStateStats`, `RenderBlendStateEntry` in `@flighthq/types`).** No implementation or consumer anywhere. Either the driver/stats/blend work lands against them or they are removed. Cross-package (`types`) and coupled to the driver decision — surfaced as an Open direction in the review.
- **Blend save/restore stack (`pushRenderBlendState`/`popRenderBlendState`).** Additive and in-package, but couples with the driver (push/pop across clip/group boundaries). Land after the driver.
- **`drawRenderQueue(state, queue)` + viewport-cull integration.** The queue and `isRenderableInViewport` have zero consumers; the natural consumer is the driver's queue-fed variant. Land after the driver rather than inventing a standalone consumer.
- **Stats/counter seam (`getRenderStateStats`).** The charter's "What it is" names it; nothing exists. Depends on the driver's draw/flush counters to have anything honest to report.
- **Render-pass / render-graph.** In scope per charter Decision #2; needs its own design pass reconciling with `render-gl`/`render-wgpu` target pools. Gold-tier.
- **Scene-root aggregate revision in `@flighthq/node`.** Prerequisite for the 3D dirty short-circuit: an O(1) "anything changed under this root" counter. Cross-package; short design pass on where the counter lives and how invalidation propagates. Lands before the render-side short-circuit completes.
- **3D prepare extensions.** Material/opaque-transparent sort of the visible list, shadow-caster collection, instancing, LOD. Gated on the `scene`/`lighting`/`mesh` roadmap — do not build unilaterally.
- **`preparedScenes` WeakMap → `RenderStateRuntime` slot.** Charter North star #4 prefers runtime slots over module-level state (same for `_buildStack` vs the runtime `tempStack`). Functionally equivalent today; the fix adds a field to `RenderStateRuntime` in `@flighthq/types`, so it is cross-package — fold into the next types-touching render pass.
- **Home the `explain*` return types.** `DisplayObjectRenderExplanation` lives in-package; whether `explain*` plain-data returns are a blessed local exception to types-first belongs in the diagnostics convention — an Open direction, not unilateral work.
- **`flighthq-render` Rust crate.** Large, separate workstream. Follows TS driver/queue settling.

## Approved

- [2026-07-02 · blanket "feel free to … prepare instructions for builder"] Delete `beginRenderProxyUpdate` (no-op) — charter Decision #6
- [2026-07-02 · blanket] Collapse `updateDisplayObjectRenderTransform` alias — charter Decision #6
- [2026-07-02 · blanket] Convert adapt hook from global to per-state — charter Decision #6
- [2026-07-02 · picked] Fix `computeRenderProxyWorldBounds` to use real world bounds, cache-aware, render-transform-aware — charter Decision #5
- [2026-07-02 · picked] Move `computeTextFormatFontString` to `@flighthq/text` — charter Decision #3
- [2026-07-03 · charter session] Guard/explain sibling modules (`enableRenderGuards`, `explainRenderState`) — charter Decision 2026-07-03 (diagnostics)
- [2026-07-09 · user "Do #1, then ensure #2 is documented … pick up the work"] Honor `sceneGraphSyncPolicy` in `prepareScene3DRender` (3D dirty short-circuit). #1 groundwork — honest light-block `version` (`packSceneLightBlock`) + version-skipped `bindGlMeshLightBlock` — shipped this session; the full short-circuit is gated on the scene-root aggregate revision in `@flighthq/node` (Backlog), which lands first.
