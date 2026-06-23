---
id: picking
title: '@flighthq/picking'
type: new-package
target: picking
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/picking.md
  - tools/agents/docs/reviews/breadth/spatial-3d.md
depends_on: []
updated: 2026-06-23
---

## Summary

3D raycasting and scene selection — ray construction from a camera + screen point, ray-vs-primitive intersection (AABB, sphere, plane, triangle, mesh), and a `pickScene` query that walks the scene graph and returns sorted hits. The 3D counterpart to `@flighthq/interaction`.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely useful version: turn a screen click into a sorted list of scene hits, using bounds-level precision. Fills the single most glaring gap (no way to select 3D content at all).

Types in `@flighthq/types` first:

- `Ray3` / `Ray3Like` — `{ originX, originY, originZ, directionX, directionY, directionZ }` (flat scalars, matching how `Aabb`/`Plane` are stored; the `*Like` is the structural input form). Direction is assumed normalized; document it.
- `RayHit` — `{ node, distance, pointX, pointY, pointZ }` where `node` is the hit `SceneNode`/`Mesh` and `distance` is the parametric `t` along the ray (world units). `point` is the world-space intersection.
- `PickResult` — `{ hits: RayHit[], count }` (an explicit count alongside a reusable array, the codebase's typed-buffer idiom), or the convention of returning `RayHit | null` for the nearest-only query.
- `PickSceneOptions` — `{ recurse, includeDisabled, maxDistance, sortByDistance, precision }` where `precision` is a `PickPrecisionKind` string identifier.
- `PickPrecisionKind` — string kind: `'BoundingSphere' | 'Aabb'` for Bronze (triangle/mesh added in Silver). PascalCase values, the codebase's string-kind model.

Ray math (lands in `@flighthq/geometry`):

- `createRay3(originX?, originY?, originZ?, directionX?, directionY?, directionZ?): Ray3`
- `setRay3 / copyRay3 / cloneRay3` and `acquireRay3 / releaseRay3` (pool brackets, matching `acquireVector3`).
- `normalizeRay3Direction(out, ray)` — ensure unit direction.
- `getRay3PointAt(out, ray, t)` — point at parametric distance (Vector3 out-param).
- `intersectRay3Aabb(ray, aabb): number` — slab test; returns nearest `t` ≥ 0 or `-1` (sentinel for no hit).
- `intersectRay3BoundingSphere(ray, sphere): number` — analytic; `-1` on miss.
- `intersectRay3Plane(ray, plane): number` — `-1` if parallel / behind.

Picking (in `@flighthq/picking`):

- `createRay3FromCamera(out, camera, screenX, screenY, viewportWidth, viewportHeight): boolean` — unproject a viewport pixel into a world ray via `getCameraInverseViewProjectionMatrix4`. Returns `false` if the camera/projection is degenerate (sentinel, not throw). The cornerstone function.
- `pickSceneNearest(scene, ray, options?): RayHit | null` — walk the scene, intersect each `Mesh`'s **world** bounds (sphere or aabb per `precision`), return the nearest hit or `null`.
- `pickScene(out, scene, ray, options?): PickResult` — same walk, fill `out.hits` with all hits, sorted near→far when `sortByDistance`. Out-param fill to avoid per-pick allocation.
- `pickSceneFromScreen(out, scene, camera, screenX, screenY, viewportWidth, viewportHeight, options?): PickResult` — convenience composing `createRay3FromCamera` + `pickScene`.

Honest effort: small. The hard part is correct unproject + alias-safe out-params; the slab/sphere tests are textbook. Bronze is shippable in isolation and immediately unblocks selection, hover, and click-to-place.

### Silver

Competitive with a well-regarded picking layer (three.js `Raycaster`, Unity `Physics.Raycast` ergonomics): triangle-accurate hits with barycentric/UV data, a manager for hover/selection over frames, and the common query shapes.

Types (`@flighthq/types`):

- Extend `PickPrecisionKind` with `'Triangle'` (and `'Mesh'` as the alias for "bounds-cull then triangle-test").
- `TriangleHit extends RayHit` — adds `triangleIndex`, barycentric `(u, v, w)`, interpolated `uvU/uvV` (when the geometry has uv0), and `frontFace: boolean`.
- `RayHitSide` — string kind `'Front' | 'Back' | 'Both'` for back-face culling control.
- `PickManager` (entity + opaque runtime) — holds the scene root, last ray, current/previous hit set, and a hover target. `PickManagerOptions` mirrors `InteractionManagerOptions`.
- `PickSignals` / `PickSignalName` / `PickSignalSlot` — `pickEnter`, `pickExit`, `pickMove`, `pickSelect` payloads, opted into via `enablePickSignals`.

Ray math (`@flighthq/geometry`):

- `intersectRay3Triangle(ray, ax, ay, az, bx, by, bz, cx, cy, cz, outBarycentric?, side?): number` — Möller–Trumbore, `-1` on miss; optional barycentric out, front/back control.
- `intersectRay3Obb` — oriented-box test (ray transformed into box local space) for tighter non-axis-aligned hits.
- `transformRay3ByMatrix4(out, ray, matrix)` — push a world ray into a node's local space (the standard "test in local space" optimization; renormalize handled).
- `getRay3ClosestPointToPoint` / `getRay3DistanceToPoint` — for snapping and gizmo proximity.

Picking (`@flighthq/picking`):

- Triangle-accurate path: `pickScene`/`pickSceneNearest` honor `PickPrecisionKind = 'Triangle'`, transforming the ray into mesh-local space, bounds-culling against local bounds, then walking `MeshGeometry` indices/positions, producing `TriangleHit`s with world-space `point`/`distance` and interpolated uv.
- `intersectRay3Mesh(out, ray, mesh, geometry, side?): TriangleHit | null` — the per-mesh primitive, reusable outside a scene walk.
- `createPickManager(scene, options?) / disposePickManager` — paired lifecycle (`dispose*`: detach signal listeners, release to GC).
- `updatePickManagerFromScreen(manager, camera, screenX, screenY, w, h)` — recompute the ray, diff hover target, emit `pickEnter`/`pickExit`/`pickMove` when signals are enabled.
- `enablePickSignals(manager): PickSignals` / `getPickSignals(manager)` — opt-in dispatch group (cost assumed only on enable), matching the interaction package's pattern.
- `setPickFilter(manager, predicate)` / a `filter` option on the query — skip nodes by predicate (layers, tags, "ignore this gizmo").
- `pickSceneAll` vs `pickSceneNearest` parity; `maxResults` cap in `PickSceneOptions`.
- Cross-backend / Rust note: triangle picking must be **bit-stable** against the Rust port (it is pure float math; `flighthq-picking` is a primary conformance target precisely because it is deterministic and GPU-free).

Honest effort: moderate. Möller–Trumbore + local-space transform + the manager/diff loop are the bulk; barycentric uv interpolation and the signal group follow the established `interaction` shape. Order: triangle math → mesh query → manager/signals → filters.

### Gold

Authoritative, AAA: exhaustive query shapes, performant large-scene picking, skinned/instanced/morphed geometry, full edge-case and error handling, complete tests and docs, and 1:1 Rust parity.

Types (`@flighthq/types`):

- `PickVolumeKind` — `'Ray' | 'Frustum' | 'Sphere' | 'Box'` to unify ray-pick with marquee/region selection.
- `FrustumPickOptions`, `RegionSelectMode` (`'Contain' | 'Intersect'`).
- `PickAccelerationKind` — `'None' | 'Bvh' | 'Octree'` for the spatial structure used by a scene-wide accelerator.
- `MeshBvh` / `MeshBvhNode` — committed BVH layout for per-mesh triangle acceleration (typed-array nodes, the codebase's flat-buffer idiom).
- `SkinnedPickContext` / morph-target inputs so picking respects animated geometry.

Ray math + acceleration (`@flighthq/geometry` for the pure tests, `@flighthq/picking` for the structures):

- `intersectRay3Capsule`, `intersectRay3Cylinder`, `intersectRay3Disc`, `intersectRay3Quad` — the full primitive set parity with a mature math lib.
- `getRay3AabbEntryExit(out, ray, aabb)` — both `t` values (needed for volumetric/clipping picks).
- Frustum-vs-AABB/sphere selection already lives in `geometry` (`isFrustumIntersectingAabb`); Gold wires it into region selection.

Picking (`@flighthq/picking`):

- **Region / marquee selection:** `pickSceneInFrustum`, `pickSceneInSphere`, `pickSceneInBox` (drag-box select), honoring `RegionSelectMode`.
- **Acceleration:** `createMeshBvh(geometry) / intersectRay3MeshBvh` for fast triangle picking on heavy meshes; an optional scene-level `createSceneBvh`/`createSceneOctree` + `disposeSceneBvh` so `pickScene` is sublinear in node count. Picking should _cache and reuse_ per-mesh BVHs on the mesh runtime (nullable runtime slot, the codebase's subsystem-state pattern), invalidated on geometry change.
- **Animated geometry:** skinned-mesh picking (apply the joint palette before triangle test) and morph-target picking, so character content is selectable. Pairs with the future `@flighthq/skeleton`/`@flighthq/animation`.
- **Instanced picking:** `intersectRay3InstancedMesh` returning the hit instance index, for the instanced-draw path.
- **Precision/quality controls:** `maxDistance`, `near`, back-face culling per `RayHitSide`, double-sided material awareness, degenerate-triangle and zero-length-direction guards (return `-1`/`null`, never NaN-propagate).
- **Optional GPU pick path:** `pickSceneByColorBuffer` over a render-target id pass (object-id render + pixel readback) for pixel-exact picking of complex/alpha-tested geometry, gated behind the render packages and _not_ in the default bundle. This is the one place a backend-coupled path appears; it stays optional and tree-shakable.
- **Gizmo/manipulator support:** `getRay3ClosestPointOnSegment`, axis/plane-drag projection helpers, and screen-space pick tolerance (`pickRadius`) so thin geometry (lines, points, gizmo handles) is selectable.
- **Debug:** `getRay3DebugSegment` (origin→hit) for the future 3D debug-draw layer.

Quality bar:

- Colocated `*.test.ts` per source file, alphabetized `describe` blocks, alias-safe `out` tests (out === input) for every out-param math function, and the standard "distinct vs aliased" cases.
- Functional/parity coverage: a pick scene rendered + a pixel oracle confirming the selected mesh, run across backends and against the Rust `flighthq-picking` fingerprint (bit-stable expectation).
- Docs: a domain doc (`tools/agents/docs/`?) only if rules can't live in source; otherwise self-documenting names + comments on coordinate-space and normalization assumptions.

Honest effort: large, and most of it is independent of the rest of the 3D back-half. Order: extra primitives → region selection → per-mesh BVH + runtime caching → scene accelerator → skinned/instanced (after skeleton/instancing land) → optional GPU buffer path last.

## Boundaries

- **Ray3 primitive + pure ray-vs-primitive math live in `@flighthq/geometry`, not `picking`.** `picking` owns only the camera-aware ray construction and the scene-graph query layer. This keeps the reusable math with the rest of the math and `picking` a thin cell.
- **2D hit testing stays in `@flighthq/interaction`.** No overlap: `interaction` is display-object/screen-space; `picking` is 3D world-space. They are deliberate counterparts, not merge candidates.
- **Pointer event plumbing (DOM/native) stays in `@flighthq/input` / `@flighthq/interaction`.** `picking` takes already-resolved `screenX/screenY` + viewport size; it never touches `addEventListener`.
- **Frustum _culling_ for rendering stays in `@flighthq/render` (`collectVisibleMeshes`).** `picking` reuses the same `geometry` frustum tests for _selection_ but does not own the render cull pass.
- **No file import.** No `-formats` neighbor; glTF/OBJ import is `@flighthq/gltf` / `model-formats`' job. Picking consumes whatever produced the `MeshGeometry`.
- **No GPU resource ownership in the core.** The optional color-buffer pick path is the lone backend-coupled extension and stays out of the default, tree-shakable surface.
- **Physics (rigid bodies, continuous collision, raycast-against-colliders) is out of scope.** Picking is selection-grade geometry queries, not a physics engine; a future `@flighthq/physics` would own dynamics and could _reuse_ the `geometry` ray math.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **`PickResult` shape: reusable `{ hits, count }` buffer vs returning a fresh array.** The out-param `{ hits, count }` form matches the codebase's typed-buffer / no-hot-loop-allocation rule, but is less ergonomic than `RayHit[]`. Likely answer: out-param `pickScene` as the canonical hot path, plus a convenience `pickSceneNearest` returning `RayHit | null`. Confirm against how `interaction` returns hit targets.
- **Where exactly the `Ray3` math splits.** Proposed: type + intersection tests in `geometry`; everything camera/scene-aware in `picking`. Need to confirm `geometry` is the right home (it has the precedent with `Plane`/`Frustum`) versus a tiny `geometry` addition feeling out of place — but a ray with no intersection tests would be a stub, so the tests should travel with it.
- **Coordinate / handedness + NDC convention.** `createRay3FromCamera` must agree with `camera`'s projection handedness and the renderers' NDC/Y-flip. This is the highest-risk correctness item; it should be pinned by a functional parity test (TS backends + Rust) before Silver, not asserted in prose.
- **Per-mesh BVH ownership & invalidation.** Caching a BVH on the mesh runtime slot (Gold) needs an invalidation signal when `MeshGeometry` mutates. Does `mesh` expose a geometry-version/dirty hook, or must `picking` hash buffers? Likely a small addition to `mesh`'s runtime — surface as a cross-package suggestion.
- **Manager vs free-function ergonomics.** `interaction` is heavily manager-based; picking's lowest layer is naturally free functions. Decide whether `PickManager` is core (Silver) or whether most users stay with `pickSceneFromScreen` per frame and the manager is opt-in sugar. Leaning: free functions are the spine, manager is the convenience for hover/selection-over-time.
- **GPU color-buffer picking: in `picking` (feature-gated) or a separate `picking-gl`/`picking-wgpu` neighbor?** A `<subject>-<backend>` split would match the render layering, but the volume is tiny. Defer until there is a concrete need; default CPU path ships first regardless.
- **Skinned/morph picking depends on packages that don't exist yet** (`skeleton`, `animation`, instancing). The `SkinnedPickContext` type can be defined in `@flighthq/types` early, but the implementation should wait for those subsystems rather than inventing a skinning representation here.

## Agent brief

> Create `@flighthq/picking` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
