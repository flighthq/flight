---
package: '@flighthq/camera'
updated: 2026-08-08
by: principal
---

# camera — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/camera/src/` and `packages/types/src/` on 2026-08-08.
A file:line here is a claim about this tree, not about a session. This cell owns **both** cameras —
the 3D projection/frustum surface and the absorbed 2D `Camera2D`; `camera-controls` is a neighbor.

- **`PerspectiveProjection.aspect` is write-only inside this package.** `setCamera3DAspect`
  (`camera.ts:64`) stores it, but `setProjectionMatrix4` always uses its
  `aspect` *parameter* and never reads `projection.aspect`, and every VP helper threads that
  parameter (`camera.ts:51`, `culling.ts:21`, `frustumCorners.ts:25`, `intersection.ts:22`,
  `picking.ts`). Two sources of truth for one value, with the caller's argument silently winning.
  Either the stored field becomes the default when no argument is supplied, or it should go.
- **`getCamera3DFrustumCorners` allocates on every call.** `frustumCorners.ts:34` builds a fresh
  nested `ndcCorners` array literal and `:45` pushes eight `number[]` triples into a fresh `results`
  array — per frame, per camera, in a cascaded-shadow-map path. The file already has module-level
  matrix scratch (`:70-71`); these two want the same treatment.
- **Caller-facing comment where a delegation should be.** `basis.ts:22-23` tells the reader that the
  mesh renderer's `setGlMeshCameraPosition` "should delegate here rather than recomputing it
  inline" — it still recomputes (`scene3d-gl/src/glMeshProgram.ts:207-209`), and the comment names
  the pre-rename `scene-gl`. A comment aimed at a caller is a missing change, not documentation.
- **No off-axis / asymmetric projection.** No `createOffAxisPerspectiveProjection` or
  `createOffAxisOrthographicProjection` anywhere in `packages/`. Needs two new `kind` strings on the
  `Projection` union (`types/src/Camera3D.ts:23`) and a branch in `setProjectionMatrix4`. Unblocked.
- **No reversed-Z or infinite-far perspective.** Absent from `packages/`. This one is not unblocked:
  it pins the depth-range convention (NDC `[-1,1]` vs `[0,1]`) shared with `render-gl` and
  `render-wgpu`, and `getCamera3DLinearDepth` (`depth.ts:14`) is written against `[-1, 1]`.
- **`Camera3D` stores no viewport.** `Camera2D` carries `viewportWidth`/`viewportHeight`
  (`types/src/Camera2D.ts:15-16`); `Camera3D` (`types/src/Camera3D.ts:11-18`) has none, which is why
  aspect is threaded rather than derived. The asymmetry between the two cameras is the decision here.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-25 entry is **false end to
  end** and is dropped: it recorded that `src/` held only `camera.ts` and `projection.ts` and that
  `basis`/`culling`/`depth`/`frustumCorners`/`intersection`/`picking` existed "only as stale compiled
  output under `dist/`". All six are live source with colocated tests, alongside the absorbed 2D set
  (`camera2d`, `parallax`, `projection2d`, `viewMatrix`, `visibleBounds`, `zoom`) and
  `shadowCamera.ts`. Also dropped as landed: the recommendation to scope `getCamera3DLinearDepth` to
  perspective — it branches on `projection.kind` at `depth.ts:21`. The `@flighthq/camera-controller`
  item is obsolete: `camera-controls` exists as its own cell. Rust-parity narration dropped; there is
  no `crates/` tree in this repo.
- **2026-06-24** — Landed the picking/basis/culling/frustum-corner/depth/intersection surface and the
  `updateCamera3DInverseViewProjection` scratch fix; `Ray3D` + `isFrustumIntersectingSphere` went to
  `types`/`geometry`.
