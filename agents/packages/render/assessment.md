---
package: '@flighthq/render'
updated: 2026-07-09
basedOn: ./review.md
---

# render — Assessment

Sorted from `review.md` and the direction session (2026-07-02). Six Decisions blessed. Approved items below are the sweep-safe work dispatchable to a builder now.

## Recommended

Strictly sweep-safe: within `@flighthq/render` (and cross-package for the font-string move, which is blessed), no unresolved design decision.

- **Delete `beginRenderProxyUpdate`.** Exported no-op (`{}`), no callers outside its declaration. Pure API debt removal.
- **Collapse `updateDisplayObjectRenderTransform` into `updateRenderProxy2DTransform`.** Thin alias, no external callers. Remove the wrapper, keep the canonical name.
- **Convert `installRenderAdaptHook` from global to per-state.** Move `_adaptHook` from module-level to a slot on `RenderStateRuntime`. Update `installRenderAdaptHook(state, fn)` to take a state parameter. Update `renderProxyAdapter.ts` (`_installed` flag → per-state install). Multiple render states coexist independently.
- **Fix `computeRenderProxyWorldBounds` to use real world bounds.** Replace the local-x/y-with-zero-size stub with a call to `getNodeWorldBoundsRectangle` from `@flighthq/node`. Account for the render transform when comparing against the viewport (the viewport is in screen/device coordinates). Use the node's cached, revision-gated world bounds — do not recompute in the hot loop. Fix the edge-inclusivity comment to match the code (inclusive on all edges). Replace the bare `Rectangle` literal cast with `createRectangle()`. Replace the `'pivotX' in source` duck-type sniff with proper type narrowing via `Spatial2DNode`.
- **Move `computeTextFormatFontString` to `@flighthq/text`.** Cross-package, blessed by Decision #3. ~14 import sites across `displayobject-canvas`, `displayobject-dom`, `displayobject-gl`, `displayobject-wgpu`, `textshaper-canvas`.

- **Add `enableRenderGuards(state)` and `explainRenderState(state, root)` (sibling guard/explain modules).** Chartered by the 2026-07-03 Decision. Three warn-once checks: unregistered kind at the `renderProxy.ts` `rendererMap` lookup; draw-before-prepare via `currentFrameId`; clip data present while the clip hook slot is null. Emission via `@flighthq/log` `logOnce`, channel `'render'`; messages name the invariant and the exact fixing call. `explainRenderState` returns plain data; add `formatRenderStateExplanation`. `areRenderGuardsEnabled(state)` mirror. No new imports in core modules — only the sibling modules import log. Fire/silent test pair per guard via `createMemoryLogSink`.

- **Honor `sceneGraphSyncPolicy` in `prepareSceneRender` — a 3D dirty short-circuit.** User-approved 2026-07-09 (see Approved). Today `prepareSceneRender` (`sceneRender.ts`) re-walks the hierarchy, re-culls, and rebuilds the `SceneRenderList` on every call, ignoring `state.sceneGraphSyncPolicy`; the 3D analog of the 2D `requiresInvalidation` path (`isRenderProxyDirty`, `renderProxy.ts:132`) is missing. Under `requiresInvalidation`, skip the walk/cull/rebuild and return the cached list when nothing changed since the last prepare for this state. Dirty set: (a) any descendant world-transform revision, (b) `enabled` flags + hierarchy structure (child add/remove), (c) each visible mesh's `geometry.version`, (d) camera view + projection, (e) the light-block `version`. Design resolved: detecting (a)/(b) without a walk needs a scene-root aggregate revision in `@flighthq/node` — the one cross-package prerequisite, tracked separately in Backlog. Keep `refreshDerivedState` (the default) always-refresh so behavior is unchanged unless a caller opts in. Also make the 3D world-transform cache honor `refreshDerivedState` (force `recomputeWorldTransform3D`, `transform3d.ts:48`) so direct-write semantics match the 2D side. Groundwork shipped 2026-07-09: `packSceneLightBlock` now bumps `version` only on an actual change and scene-gl's `bindGlMeshLightBlock` skips unchanged uploads, so (e) is already a reliable dirty signal. Note: scene-wgpu bundles lights into the per-frame Frame uniform alongside the camera (which changes every frame), so its light upload can't be version-skipped independently — no action there.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Shared draw driver (`drawRenderProxy`/`submitRenderProxy`/`flushRenderBatch`/`registerRenderBatchFlush`).** Charter Decision #1 blessed this. Medium effort, needs `RenderBatchKey`/`RenderDrawContext`/`RenderStateStats` types in `@flighthq/types` first. The keystone item — should land before `displayobject-gl`/`displayobject-wgpu` leaf renderers are built. Separate dispatch.
- **Blend save/restore stack.** `pushRenderBlendState`/`popRenderBlendState` for nested blend groups. Additive, in-package, but couples with the driver (the driver push/pops across clip/group boundaries). Land after the driver.
- **`getRenderStateStats` snapshot.** When the driver lands, the stats should return a true snapshot (copy), not a narrowed live reference. Depends on the driver types existing.
- **`drawRenderQueue(state, queue)` variant.** Drives draws from a pre-sorted `RenderQueue` rather than re-walking the graph. Natural extension of the driver + queue. Land after the driver.
- **Render-pass / render-graph.** Charter Decision #2 blessed this as in-scope. Needs its own design pass — must reconcile with `render-gl`/`render-wgpu` target pools. Gold-tier.
- **3D prepare extensions.** Point/spot lights, shadow-caster collection, material sort, instancing, LOD. Gated on `scene`/`lighting`/`mesh` roadmap — do not build unilaterally.
- **Scene-root aggregate revision in `@flighthq/node`.** Prerequisite for the `prepareSceneRender` dirty short-circuit (Recommended): a root-level counter that bumps when any descendant's transform, `enabled`, or hierarchy structure changes, so the scene prepare can detect "nothing changed" in O(1) instead of walking. Cross-package (node); needs a short design pass on where the counter lives (a root runtime slot) and how `invalidateNodeLocalTransform` / child mutation propagate to it. Land before the render-side short-circuit.
- **`flighthq-render` Rust crate.** Large, separate workstream. Follows TS driver/queue settling.

## Approved

- [2026-07-02 · blanket "feel free to … prepare instructions for builder"] Delete `beginRenderProxyUpdate` (no-op) — charter Decision #6
- [2026-07-02 · blanket] Collapse `updateDisplayObjectRenderTransform` alias — charter Decision #6
- [2026-07-02 · blanket] Convert adapt hook from global to per-state — charter Decision #6
- [2026-07-02 · picked] Fix `computeRenderProxyWorldBounds` to use real world bounds, cache-aware, render-transform-aware — charter Decision #5
- [2026-07-02 · picked] Move `computeTextFormatFontString` to `@flighthq/text` — charter Decision #3
- [2026-07-03 · charter session] Guard/explain sibling modules (`enableRenderGuards`, `explainRenderState`) — charter Decision 2026-07-03 (diagnostics)
- [2026-07-09 · user "Do #1, then ensure #2 is documented … pick up the work"] Honor `sceneGraphSyncPolicy` in `prepareSceneRender` (3D dirty short-circuit). #1 groundwork — honest light-block `version` (`packSceneLightBlock`) + version-skipped `bindGlMeshLightBlock` — shipped this session; the full short-circuit is gated on the scene-root aggregate revision in `@flighthq/node` (Backlog), which lands first.
