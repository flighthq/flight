---
package: '@flighthq/render'
status: solid
score: 84
updated: 2026-09-23
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - package.json
  - assessment.md
---

# render — Review

## Verdict

`solid — 84/100`. The backend-neutral preparation layer has sound state ownership, deterministic proxy
teardown, typed 2D bounds, iterative 3D collection, registry diagnostics, and honest host-backed canvas
surface helpers. The stale review understated those fixes while describing several removed APIs.

The package is not yet authoritative against its own charter. Its retained queue and viewport culling
have no production consumer, and the chartered shared draw driver, counter snapshot, blend stack, and
render-pass/graph layer do not exist. The current code is reliable preparation infrastructure; it is not
yet the complete backend-neutral render orchestration described by the charter.

## Current architecture

- `RenderStateRuntime` owns proxy maps, live proxy sources, registries, miss signaling, and traversal
  scratch. `destroyRenderState` runs renderer teardown for every live proxy and clears state-owned
  bookkeeping.
- `prepareScene2DRender` maintains the scene-to-proxy layer and exposes explicit coverage diagnostics.
  `computeRenderProxyWorldBounds` and viewport tests now accept `Node2D` directly and use real cached
  world bounds; the former `pivotX` duck-typing path is gone.
- `prepareScene3DRender` packs lights and collects visible Mesh and InstancedMesh nodes with an explicit
  stack. It honors the scene-graph sync policy and maintains stable reusable lists, including cached
  instanced-mesh bounds.
- `RenderQueue` is a reusable retained container with explicit build, clear, sort, and sort-key helpers.
  It is currently an isolated primitive: production code outside the module does not consume it.
- `createCanvasHostSurface`, `getCanvasHostSurface`, and `destroyCanvasHostSurface` provide a small
  backend-neutral ownership bridge for raster fallbacks. Destruction returns a surface to its original
  `HostCanvasCapability` exactly once.
- The package has 23 implementation files and 23 colocated test files after excluding its barrels.
  The tests cover every implementation module, including state isolation, coverage diagnostics, queue
  behavior, 2D bounds, canvas-surface ownership, and 3D preparation.

## Gaps

- The shared draw driver blessed by the charter is absent: there is no `drawRenderProxy`,
  `submitRenderProxy`, `flushRenderBatch`, or `registerRenderBatchFlush`. Concrete backends still own
  their draw walks.
- `buildRenderQueue`, `sortRenderQueue`, `isRenderableInViewport`, and `isRenderProxyInViewport` have
  no production callers outside their defining modules. The queue also allocates an entry object per
  push and a slice per sort, contrary to its intended hot-path posture.
- The counter-level stats seam, blend save/restore stack, and optional render-pass/render-graph layer
  named by the charter are unimplemented.
- `prepareScene3DRender` clears and walks the visible subtree on every call. It has no root aggregate
  revision that can prove a prepared list remains current.
- Some mutable state remains at module scope: `preparedScene3Ds`, `_buildStack`, `_collectStack`, and
  guard/scratch values. WeakMap-keyed state and reusable scratch are behaviorally safer than a shared
  provider, but they still diverge from the charter's strict runtime-slot north star and complicate
  re-entrancy.

## Charter fit

The package maintains the important boundaries: it contains no concrete GL/WGPU draw code, consumes
node and lighting contracts rather than defining them, keeps public types in `@flighthq/types`, and
makes 3D additive. Its charter overstates current ownership of a shared draw contract, stats, and a
render graph. Those are valid directed goals, not present capabilities.

The existing assessment's two remaining Recommended items have landed: viewport narrowing no longer
duck-types a node, and 3D collection is iterative. Its Backlog remains the more accurate description of
the work needed to complete the charter. The append-only Approved history was left untouched.

## Export review

The old `createImageSurface` / `destroyImageSurface` pair was replaced with the explicit
`createCanvasHostSurface`, `destroyCanvasHostSurface`, and `getCanvasHostSurface` ownership seam. The
helpers are used by canvas-backed fallbacks in downstream render backends, and the refreshed export
snapshot records the reviewed rename and accessor addition.
