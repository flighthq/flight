---
package: '@flighthq/picking'
status: solid
score: 58
updated: 2026-07-09
ingested:
  - source
  - tests
---

# picking — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/picking.md)._

**Domain:** 3D scene picking — resolving pointer/ray queries against scene geometry (CPU ray casting with broad/narrow phases, and eventually GPU ID-buffer picking and region selection).

**Verdict:** partial — completeness 32/100

The package exports a single function, `pickScene(scene, camera, screenX, screenY, out)`, which builds a camera pick ray from NDC coordinates, broad-phases against each mesh's world AABB, narrow-phases with a brute-force ray↔triangle sweep in mesh-local space, and fills a `SceneHit` (nearest mesh, parametric distance in world units, world point, barycentric weights) or returns `null` on a miss. What exists is carefully engineered — the local-space transform with intentionally un-normalized direction keeps `t` comparable across meshes, the scratch objects make it alloc-free, and it is honest about being "bronze precision" (no BVH). But an authoritative picking system (three.js `Raycaster`, engine ID-buffer pickers, three-mesh-bvh) is a family of query shapes and result options; this is one query shape with a fixed result, no filtering, no acceleration, and no GPU path.

## Present capabilities

- `pickScene` — camera-ray nearest-mesh pick. Correctly layered: `getCameraScreenToWorldRay` (from `@flighthq/camera`) → per-node `getSceneNodeWorldBounds` broad phase → `intersectRay3DTriangle` narrow phase over `MeshGeometry` (indexed and non-indexed both handled). Returns the sentinel `null` on a miss and leaves `out` untouched (documented alias/miss behavior). Barycentric weights computed with degenerate-triangle fallback; world hit point recovered from the world ray at `t`.
- Reuses the right primitives from siblings rather than reimplementing: `intersectRay3DAabb`/`intersectRay3DTriangle`/`getRay3DPointAt` from `@flighthq/geometry`, mesh accessors from `@flighthq/mesh`, world transforms from `@flighthq/node`. Good cellular citizenship.
- Tests cover hit/miss, non-mesh scenes, nearest-of-two-overlapping-meshes, and barycentric-sum-to-one. No test for a transformed (rotated/scaled) mesh, which is exactly the path the local-space design exists for — a coverage gap worth closing.

`SceneHit` lives in `@flighthq/types` with a clear doc comment. The package is `sideEffects: false` with module-scratch state at the bottom of the file per source style. (Note: module-level scratch makes `pickScene` non-reentrant — fine single-threaded, worth a comment for the C/C++ port.)

## Gaps vs an authoritative picking library

- **No ray-input variant.** Picking is hard-wired to `(camera, screenX, screenY)`. There is no `pickSceneWithRay3D(scene, ray, out)` — needed for VR controllers, gameplay ray queries (line of sight, projectile), editor gizmos, and non-camera rays. The camera version should be a thin wrapper over the ray version; today the general primitive is the one that is missing.
- **`SceneHit` has no `triangleIndex`.** Barycentric weights without the triangle they refer to cannot reconstruct anything — hit UV, hit normal, and vertex-attribute interpolation all need the triangle. This is a header-layer fix with outsized value.
- **No hit normal / hit UV.** Every mature raycaster returns the geometric face normal (and usually the interpolated smooth normal and UV at the hit). The mesh accessors and barycentric weights are already in hand; only the output fields and interpolation are missing.
- **No pick-all.** Only nearest-hit. `pickSceneAll` (collect every hit, sorted by distance, into a caller array) is the standard second query — needed for click-through, transparency-aware picking, and selection cycling.
- **No filtering.** No predicate/layer-mask/`pickable` flag — every `Mesh` in the scene is always a candidate. Editors and games both need "ignore gizmos", "only this layer", "skip invisible" (visibility is not even checked today: hidden meshes are pickable).
- **No backface option.** `intersectRay3DTriangle`'s winding behavior is silently inherited; an authoritative picker exposes cull-backface vs double-sided per query (three.js honors `material.side`).
- **No acceleration structure.** Brute-force per-triangle is acknowledged as bronze; the target state needs a per-`MeshGeometry` BVH (compare three-mesh-bvh, which is the de-facto requirement above ~10k triangles) and ideally a scene-level BVH over the broad phase.
- **No non-mesh subjects.** Rays vs points/lines/billboards/sprites (with pick thresholds) are absent — acceptable while the scene graph only has meshes, but part of the domain surface.
- **No skinned or instanced picking.** A skinned mesh will be picked against its bind-pose vertices (wrong once `@flighthq/skeleton` animates it — this is one reason the skeleton review asks for CPU skinning); instanced rendering has no per-instance-id hit concept.
- **No region selection.** Frustum/box/lasso selection ("marquee select") is a standard picking-family query with no home yet.
- **No ID-buffer (GPU) picking path.** Render-each-node-with-a-color-ID and read back one pixel — the pixel-exact technique for dense scenes, and the natural cross-check for the CPU path. This would be a `picking-gl`/`picking-wgpu` backend concern layered like `filters-gl`, but nothing defines the substrate-agnostic seam (ID assignment, readback request) here.
- **No distance limits.** No near/far clamp on the query (`Raycaster.near/far`) for cheap culling and gameplay ranges.
- **NDC-only input.** `screenX/screenY` in `[-1, 1]` with the viewport mapping "the caller's responsibility" is a defensible layering, but there is no helper anywhere to go from pointer pixels to NDC; every consumer will write the same two lines. A tiny `getViewportNormalizedDeviceCoordinates`-style helper (here or in `camera`) closes the loop.
- Minor: for an orthographic camera the code passes `aspect = 1` to `getCameraScreenToWorldRay`; if the orthographic projection is non-square this silently mismaps X — worth a test either way.

## Naming / API-shape notes

- `pickScene` — the verb is good and domain-precise, but the SDK rule says the exported name should carry the operated-on type fully; it does (`Scene`), and it is globally unique. Future variants should follow the same stem: `pickSceneWithRay3D`, `pickSceneAll`.
- Sentinel-`null` on miss with `out` untouched, out-parameter result, `Readonly<>` inputs, alloc-free scratch — all squarely on the SDK's conventions. The `return found ? out : null` shape (fill `out`, return it or `null`) matches the geometry intersection family.
- `SceneHit.pointX/pointY/pointZ` as flat scalars (rather than a nested `Vector3`) is C-portable and allocation-free — consistent; when `normal`/`uv` are added they should follow the same flat-scalar shape.
- The private `transformPointByMatrix4` / `transformDirectionByMatrix4` helpers operate on a raw `Float32Array` column-major matrix — these are general geometry operations duplicated locally; `@flighthq/geometry` should own `transformVector3ByMatrix4` / `transformVector3DirectionByMatrix4` and this package should consume them (the picking comment about un-normalized direction preserving `t` is a durable semantic worth keeping at the callsite).
- The filter question (layers/predicate) is an API-design fork: a positional `options`/predicate parameter vs a `pickable`/layer field on the node. Given the SDK's plain-data leanings, a node-side flag plus an optional predicate argument is the likely shape — flag it for the design pass rather than growing `pickScene`'s signature ad hoc.

## Recommendation

Grow this from one query into the query family, roughly in value order:

1. **Extract `pickSceneWithRay3D`** and make the camera version a wrapper; move the two matrix-transform helpers into `@flighthq/geometry`.
2. **Enrich `SceneHit`**: `triangleIndex`, face normal (`normalX/Y/Z`), and hit UV via the barycentrics already computed. Header-layer change first.
3. **Add filtering and visibility**: skip non-visible nodes by default; accept a predicate/layer mask; expose the backface/double-sided option.
4. **`pickSceneAll`** (sorted, caller-supplied array) and near/far distance limits.
5. **Per-geometry BVH** as the promised additive optimization (its own build/refit functions so unused scenes never pay), then a scene-level broad-phase structure.
6. **Design the ID-buffer seam** (substrate-agnostic ID assignment + readback, `picking-gl`/`picking-wgpu` executors) and region selection as follow-on packages/passes — surface to the user, since both cross package boundaries.

The single function present is well above stub quality — layered correctly, alias-documented, honest about precision tier — but a picking library is measured by its query surface, and that surface is one cell wide.

## 2026-07-09 — deepened

pickSceneWithRay3D primitive, pickSceneAll, ScenePickOptions (predicate/maxDistance/cull), SceneHit face normals + triangleIndex, visibility skip (commit 155314a2). The assessment Recommended items landed and gated green; a full re-review to reconfirm this directional score is due.
