---
package: '@flighthq/render'
updated: 2026-07-21
basedOn: ./review.md
---

# render — Assessment

Sorted from the 2026-07-13 full survey (`review.md`). Of the seven Approved entries, five have landed in source (no-op deletion, alias collapse, per-state adapt hook, the world-bounds viewport fix minus its duck-type residual, and the `computeTextFormatFontString` move to `@flighthq/text`); the guard/explain set and the 3D dirty short-circuit remain pending. Landed items are dropped from Recommended; their residuals and the still-pending approved work stay.

## Directed

1. **Make `RenderTarget` + device-pixel `Viewport` the allocation-free sub-target primitive.** A render pass can address only part of an existing target without allocating another GPU target. The `Viewport` remains an `Entity`: every Flight `create*` must return an `Entity` because that shape contract is load-bearing for the current OOP layer.
2. **Treat viewport aspect as authoritative at draw time.** Camera-stored aspect is only a fallback for standalone/headless matrix work. Rendering the same camera into two viewports must derive two projection aspects without mutating the camera between draws.
3. **Keep `RenderState` as the explicit current command/destination context.** Draw operations may update state-owned backend bindings and caches, just as Canvas and DOM draws affect their current destination. Persistent semantic changes must have named operations; backend bookkeeping stays private behind the state/runtime rather than leaking as public `gl*` fields.
4. **Retire `RenderViewport2D` without inventing a false world-space replacement.** Its old rectangle is screen-space after an optional transform. Reuse `RectangleLike`/the picking rectangle where that is the real contract, or introduce a precisely named cull rectangle only if a distinct concept remains.

## Depth gaps

1. **Defer render-graph machinery until the attachment/pass contracts are proven.** Explicit pass inputs and outputs are needed now; a general render graph, occlusion system, and other scheduling machinery are later composition layers rather than current bedrock.

## Recommended

Strictly sweep-safe: within `@flighthq/render`, no unresolved design decision.

- **Replace the `'pivotX' in source` duck-type sniff in `isSpatial2DNode` (`renderViewport.ts`).** The one residual of the approved world-bounds fix: the bounds computation, render-transform handling, inclusive-edge comment, and `createRectangle()` scratch all landed, but trait detection still keys off a single field name. Use proper `Spatial2DNode` narrowing (or the node package's trait predicate if one exists at review time).
- **Complete the chartered guard/explain set (Approved 2026-07-03, still pending).** `enableRenderGuards(state)` with the three warn-once checks (unregistered kind at the `rendererMap` lookup; draw-before-prepare via `currentFrameId`; clip data present while `displayObjectClipHooks` is null), `areRenderGuardsEnabled(state)`, `explainRenderState(state, root)` returning plain data, and `formatRenderStateExplanation`. Also add the `format*` companion `explainDisplayObjectRender`'s own doc comment promises. Emission via `@flighthq/log` `logOnce`, channel `'render'`; only sibling modules import log; fire/silent test pair per guard. The shipped `enableColorAdjustmentGuards` + `explainDisplayObjectRender` are the pattern to follow, not a substitute.
- **Honor `sceneGraphSyncPolicy` in `prepareSceneRender` — the 3D dirty short-circuit (Approved 2026-07-09, still pending).** Under `requiresInvalidation`, skip the walk/cull/rebuild and return the cached `SceneRenderList` when nothing changed. Dirty inputs: descendant world-transform/structure (needs the scene-root aggregate revision in `@flighthq/node` — the cross-package prerequisite in Backlog, which lands first), visible-mesh `geometry.version`, camera view+projection, and the light-block `version` (already honest since 2026-07-09). Keep `refreshDerivedState` always-refresh so default behavior is unchanged.
- **Delete the dead `RenderTargetSizeOptions` export (`renderTarget.ts`).** Exported type referenced by nothing in the tree — not even `computeRenderTargetSize` in the same file, which takes positional `minWidth`/`minHeight`. Pure surface debt.
- **Fix the stale `drawDriver` comment (`renderQueue.ts:114`).** It cites "the drawDriver's `_drawStack`", a module that does not exist in this tree. Reword to name only the scratch that exists (the per-state `tempStack`).
- **Convert `collectVisibleMeshes` (`sceneRender.ts`) to the package's explicit-stack walk pattern.** Every other traversal here (`walkNode`, `walkRenderSubtree`, `buildRenderQueue`) is iterative; the 3D collect is the lone call-stack recursion — align it for consistency and deep-scene safety.
- **Give `computeRenderTargetSize` an `out`-parameter form (or document the allocation).** It allocates a `{width, height}` object per call in cache-refresh paths; the package's own constraint is explicit allocation with `out`-params for compute functions. Greenfield: reshape the signature rather than adding a second name.

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
- [2026-07-09 · user "Do #1, then ensure #2 is documented … pick up the work"] Honor `sceneGraphSyncPolicy` in `prepareSceneRender` (3D dirty short-circuit). #1 groundwork — honest light-block `version` (`packSceneLightBlock`) + version-skipped `bindGlMeshLightBlock` — shipped this session; the full short-circuit is gated on the scene-root aggregate revision in `@flighthq/node` (Backlog), which lands first.
