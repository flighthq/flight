---
package: '@flighthq/picking'
updated: 2026-07-03
basedOn: ./review.md
---

# picking — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (partial, 32/100). The one function present is well-layered and alias-documented; the work is growing one query into the query family. Two charter Decisions (route through `scene`'s `raycastSceneNode`; move the transform helpers into `@flighthq/geometry`) are blessed direction but not yet sweep-safe — neither the scene raycast API nor the geometry exports exist today, so both sit in Backlog as cross-package moves. Per the blessed 3D pipeline architecture, brute-force stays the v1 narrow phase and BVH remains a later additive optimization.

## Recommended

1. Extract `pickSceneWithRay3D(scene, ray, out)` and make `pickScene` the thin camera wrapper over it — the general primitive (VR controllers, gameplay ray queries, gizmos) is currently the missing one.
2. Enrich `SceneHit` with `triangleIndex` and the geometric face normal (flat `normalX/Y/Z` scalars, matching the existing flat-point shape) — barycentric weights without the triangle they refer to cannot reconstruct anything. Header-layer change first.
3. Skip non-visible meshes by default — hidden meshes are pickable today.
4. Query options per the charter Decision set: optional predicate filter, near/far distance limits (`maxDistance`), and backface-cull vs double-sided — implemented locally on the pick query until the scene-raycast move lands.
5. `pickSceneAll` (every hit, sorted by distance, into a caller-supplied array) — charter Decision 2026-07-03.
6. Coverage and hygiene: a transformed (rotated/scaled) mesh test — the exact path the local-space design exists for; an orthographic non-square-aspect test (the `aspect = 1` pass-through may silently mismap X); a durable comment noting module-scratch non-reentrancy for the C/C++ port.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Move `transformPointByMatrix4`/`transformDirectionByMatrix4` into `@flighthq/geometry`** (as `transformVector3ByMatrix4` / `transformVector3DirectionByMatrix4`). _Parked — charter-blessed (Decision 2026-07-03) but cross-package: the geometry exports do not exist yet; keep the un-normalized-direction-preserves-`t` comment at the callsite when consuming them._
- **Route the narrow phase through `scene`'s `raycastSceneNode`.** _Parked — charter-blessed (Decision 2026-07-03) but cross-package: `scene` has no raycast API today; the traversal must be built there first._
- **Interpolated vertex normal + hit UV** at the intersection. _Parked — charter Open direction (barycentric interpolation of vertex normals); the geometric face normal above is the sweep-safe slice._
- **Pixel→NDC helper** (`getViewportNormalizedDeviceCoordinates`-style). _Parked — home fork: picking vs `camera`; every consumer currently writes the same two lines._
- **Acceleration structures** (per-`MeshGeometry` BVH, scene-level broad phase). _Parked — charter non-goal (spatial acceleration belongs to `scene`); the 3D pipeline architecture keeps BVH a later additive optimization, not v1._
- **GPU ID-buffer picking seam** (substrate-agnostic ID assignment + readback; `picking-gl`/`picking-wgpu` executors). _Parked — design decision / cross-package; charter Open direction._
- **Region selection** (frustum/box/lasso marquee). _Parked — a new query family needing its own design; candidate Open direction for the charter._
- **Skinned and instanced picking.** _Parked — cross-package: depends on `skeleton`'s CPU skinning and the instancing draw path in `scene-{backend}`._
- **Non-mesh pick subjects** (points/lines/billboards with pick thresholds). _Parked — waits on those node families existing in `scene`._

## Approved

None.
