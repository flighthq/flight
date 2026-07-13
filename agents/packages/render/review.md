---
package: '@flighthq/render'
status: solid
score: 76
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - prior review.md (2026-06-25 merge-gate)
  - source + tests (live tree)
  - agents/render-architecture.md + render-backend-support.md
---

# render — Review

> Full survey of the live package (16 source files + 16 test files, ~186 tests, `packages/render/src/`). Replaces the 2026-06-25 merge-gate review, which judged only an integration bundle's viewport-file delta (then a broken stub) — that delta has since been fixed and landed; this review judges the package as it stands.

## Verdict

**solid — 76/100.** The core the package actually owns — renderer registry, dirty-tracked 2D prepare pipeline, render-cache seam, 3D scene-prepare with frustum cull and a full punctual light block, viewport culling with real world bounds, a retained sortable queue — is well built, well commented, and genuinely tested. What keeps it out of solid-high is that a visible slice of its chartered surface is header or charter only: the shared draw driver (Decision #1, the keystone), the stats snapshot the charter's "What it is" claims in the present tense, and the blend stack all have types in `@flighthq/types` but no implementation, and the queue/viewport primitives have zero consumers anywhere in the tree.

## Present capabilities

- **Renderer registration** (`renderer.ts`): `registerRenderer` (last-write-wins, `rendererMapId` bump for proxy resync), `copyRenderersFromRenderState`/`copyAllRenderersFromRenderState`, `noopRendererData`. Mask renderers are retired (masks → clips), documented at the seam.
- **Render state** (`renderState.ts`, `renderColor.ts`): `createRenderState`/`createRenderStateRuntime`/`getRenderStateRuntime`; all mutable machinery (frame counter, proxy maps, registry, `tempStack`, `renderAdaptHook`, guard slot) lives on `RenderStateRuntime` per state. `setRenderStateBackgroundColor` derives packed/RGBA/string forms behind a documented narrow writable cast.
- **2D prepare pipeline** (`renderProxy.ts` + the trait visitors): `prepareDisplayObjectRender` → `walkNode` (explicit-stack, frame-id'd, dirty-checked via `isRenderProxyDirty` over local-transform/appearance/content revisions and `sceneGraphSyncPolicy`) → `updateRenderProxy2D` composing `updateRenderProxyAppearance`, `updateRenderProxy2DTransform`, `updateRenderProxyMaterial`, `updateRenderProxyColorTransform` (adjustment-tier fused `resolvedColorTransform`, single field read per frame), and `updateNodeClip`. One proxy type serves display objects and sprites. Teardown twins: `disposeDisplayObjectRender`/`disposeRenderProxy` cascade to `destroyData` and visit disabled/hidden nodes.
- **Adapter + render cache** (`renderProxyAdapter.ts`, `renderCache.ts`): per-state adapt hook (`installRenderAdaptHook(state, fn)` — the old global slot is gone), `setRenderProxyAdapter` self-installs the hook; `createRenderCache`/`createRenderCacheAdapter`/`useRenderCache`/`getRenderProxyCache` plus opt-in `enableRenderCacheAdapterSignals`.
- **Render-target math** (`renderTarget.ts`): `computeDisplayObjectRenderTargetTransform`, `computeRenderCacheTransform`, `computeRenderTargetSize` — consumed by `canvasCache`/`glCache`/`wgpuCache`.
- **Retained queue** (`renderQueue.ts`): `buildRenderQueue` (scene-order keys over prepared proxies), `sortRenderQueue`, `packRenderSortKey` (15-bit layer / transparent bit / 15-bit depth), capacity-reusing `pushRenderQueueEntry`/`clearRenderQueue`.
- **Viewport culling** (`renderViewport.ts`): `computeRenderProxyWorldBounds` now reads `getNodeWorldBoundsRectangle` (the merge-gate review's local-x/y-zero-size stub is fixed), `isRenderableInViewport`/`isRenderProxyInViewport` take an optional `renderTransform2D` for world→screen, inclusive edges with the comment now matching the code, `createRectangle()` scratch. Tests exercise nested/scaled parents and render transforms — the cases the old suite could not distinguish.
- **3D scene prepare** (`sceneRender.ts`): `prepareSceneRender` (world-matrix propagation, view-projection, frustum cull against transformed mesh AABBs, per-state `PreparedScene` scratch) and `packSceneLightBlock` — directional/ambient plus point/spot/hemisphere to `MAX_FORWARD_LIGHTS`, sRGB→linear premultiplied radiance, std140-exact offsets, and a pack-compare-commit so `version` bumps only on real change (the 2026-07-09 status claim, verified in source). Consumed by `scene-gl`/`scene-wgpu`.
- **Diagnostics** (`enableColorAdjustmentGuards.ts`, `explainDisplayObjectRender.ts`): a shakeable guard for the non-inlineable channel-mixing adjustment deferral (nullable runtime slot, `logOnce`, channel `'render'`), and `explainDisplayObjectRender` — a pure plain-data blank-frame query with root-cause-prioritized `reason` (`no-renderer` > `not-prepared` > `not-visible` > `zero-alpha` > `ok`).

## Gaps

Versus a mature backend-agnostic render-abstraction layer (and the charter's own in-scope list):

- **No shared draw driver.** `Renderer.submit`/`format` (`@flighthq/types/Renderer.ts`) exist for a core-owned walk-and-flush, but there is no `drawRenderProxy`/`submitRenderProxy`/`flushRenderBatch`/`registerRenderBatchFlush` — each backend still owns its draw walk. Charter Decision #1 blessed this; it has never landed.
- **Orphaned header types.** `RenderDrawContext`, `RenderStateStats`, `RenderBlendStateEntry` sit in `@flighthq/types` with no implementation and no consumer anywhere — header drift from the never-merged builder pass. Either the driver/stats/blend work lands against them or they are debt.
- **Queue and viewport culling are unconsumed.** `buildRenderQueue`/`sortRenderQueue` and `isRenderableInViewport` have zero callers outside their own tests — no `drawRenderQueue`, no cull integration in prepare or queue-build. The seams exist; nothing drives them (fork B's "don't build the dispatcher before its consumer" tension, though here the charter blesses the queue itself).
- **No stats/counter seam** — `getRenderStateStats` does not exist despite the charter's "What it is" naming a counter-level stats snapshot; no draw-call/flush counters anywhere in core.
- **No blend save/restore stack** (`pushRenderBlendState`/`popRenderBlendState` — charter Open direction #5).
- **No render-pass / render-graph abstraction** — in scope per Decision #2, still needs its design pass against `render-gl`/`render-wgpu` targets.
- **`prepareSceneRender` ignores `sceneGraphSyncPolicy`** — full re-walk/re-cull/re-pack every call; the 3D analog of `isRenderProxyDirty` is missing (Approved 2026-07-09, gated on a node-side aggregate revision). Light-block versioning (the groundwork) is done.
- **3D prepare depth**: no material/opaque-transparent sort of the visible list, no shadow-caster collection, instancing, or LOD (Open direction #4, gated on scene/lighting/mesh).
- **Chartered guard set unbuilt**: the 2026-07-03 Decision names `enableRenderGuards(state)` (unregistered-kind, draw-before-prepare, clip-data-with-null-hook), `explainRenderState(state, root)`, and `formatRenderStateExplanation`. What exists is a different (also valuable) pair — the channel-mixing guard and the per-node explain; there is no aggregate explain and no `format*` companion at all, though `explainDisplayObjectRender`'s own doc comment promises one.
- Minor: `collectVisibleMeshes` recurses (call stack) where every other walk in the package uses an explicit stack; `computeRenderTargetSize` allocates its return object with no `out` form; `RenderTargetSizeOptions` is exported but referenced by nothing, including its own file's function.

## Charter contradictions

- **"What it is" overclaims stats**: the charter states the package owns "a counter-level stats snapshot" in the present tense; no such export exists. This is charter drift (describing the target as current), not code violating a principle — a candidate charter revision.
- **North star #4 (state on the runtime, not module globals) is mostly honored, with two soft spots**: `preparedScenes` is a module-level `WeakMap<RenderState, PreparedScene>` (per-state coexistence holds, but the blessed pattern is a runtime slot), and `_buildStack` (`renderQueue.ts`) is module scratch where the prepare walk's `tempStack` lives on the runtime. Documented and single-threaded-safe; still a pattern inconsistency against the stated principle.
- Otherwise clean: no pixels in core, registry at the backend seam, no eager registration, 3D strictly additive (2D imports never touch `sceneRender`), lighting definitions consumed from descriptors not defined here. The previously-decided violations (no-op export, alias, global adapt hook, fake world bounds, font-string scope leak) are all verified gone.

## Contract & docs fit

- **Contract: good.** `sideEffects: false`, single root `.` export, thin barrel; unabbreviated self-identifying names throughout; `out`-params for target/cache-transform and bounds writers; sentinels (`null` renderer, `false` from `computeRenderProxyWorldBounds`, conservative in-viewport) not throws; `Readonly<>` on inputs; one test file per source file, alphabetized. Types are `@flighthq/types`-first with three local exceptions: `DisplayObjectRenderExplanation`/`DisplayObjectRenderBlankReason` (defensible — an `explain*` plain-data return owned by the diagnostics module) and `RenderTargetSizeOptions` (dead).
- **Residual from the approved viewport fix**: `isSpatial2DNode` still detects the trait via `'pivotX' in (source as object)` — the one piece of the Approved item ("replace the duck-type sniff with proper narrowing") that did not land.
- **Stale comment**: `renderQueue.ts:114` references "the drawDriver's `_drawStack`" — no such module exists in this tree.
- **Candidate admin-doc revisions**: (a) the Package Map line "registration, render state/queue, update pipeline, transform/color propagation" undersells the live surface — no mention of the 3D scene-prepare/light-pack pass, viewport culling, the render-cache seam, or the explain/guard diagnostics; (b) the charter "What it is" stats-snapshot claim above; (c) `render-backend-support.md` remains accurate on this package's slice (gap #8's `packSceneLightBlock` citation matches source).

## Candidate open directions

- **Orphaned driver-family types**: should `RenderDrawContext`/`RenderStateStats`/`RenderBlendStateEntry` stay in `@flighthq/types` as the pre-declared header for the blessed driver work, or be removed until the implementation lands? Types-first says header-before-implementation is the workflow; a year of drift says otherwise.
- **Where does the `explain*` return type live?** `explainDisplayObjectRender` defines its plain-data interface locally. If `explain*` queries across the SDK follow suit, the types-first rule wants an explicit carve-out documented in the diagnostics convention; if not, these move to `@flighthq/types`.
- **Guard scope**: the chartered `enableRenderGuards` bundles three checks under one enable, while the shipped `enableColorAdjustmentGuards` is per-concern. One switch or many? The diagnostics convention does not currently say.
