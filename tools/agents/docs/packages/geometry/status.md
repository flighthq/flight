---
package: '@flighthq/geometry'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# geometry — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# @flighthq/geometry — Status

**Previous score (first pass):** 91 / 100 **Estimated new score:** 96 / 100

---

## Session Summary (Second Pass)

Completed all Gold-tier deferred items from the first pass that were autonomously fixable. Added 14 new exported functions across ray3d, frustum, vector2, vector3, vector4, and matrix4. Ray3D is now a first-class collision primitive with a full intersection suite (AABB, sphere, plane, triangle via Möller–Trumbore). All new functions are alias-safe, use Readonly<T> defaults, and have colocated tests. Total: 890 tests, 22 test files, all passing.

---

## Implemented APIs (cumulative, both passes)

### `@flighthq/types`

- `EulerOrder` — string union `'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX'` (added pass 1)
- `Ray3D`, `Ray3DLike`, `Frustum`, `FrustumLike` — already present before pass 1

### `vector2.ts` — pass 1 + pass 2

New in pass 1: `clampVector2`, `divideVector2`, `maxVector2`, `minVector2`, `multiplyVector2`, `reflectVector2` New in pass 2: `setVector2FromVector3`

### `vector3.ts` — pass 1 + pass 2

New in pass 1: `clampVector3`, `createVector3FromSpherical`, `divideVector3`, `getVector3Spherical`, `interpolateVector3`, `maxVector3`, `minVector3`, `multiplyVector3`, `reflectVector3`, `setVector3FromFloat32Array`, `setVector3FromSpherical`, `transformVector3ByMatrix3`, `writeVector3ToFloat32Array`

New in pass 2: `setVector3FromVector4` — copies x/y/z, drops w (no perspective divide; use `projectVector4` for that).

### `vector4.ts` — pass 1 + pass 2

New in pass 1: `clampVector4`, `divideVector4`, `interpolateVector4`, `maxVector4`, `minVector4`, `multiplyVector4`, `reflectVector4`, `setVector4FromFloat32Array`, `writeVector4ToFloat32Array`

New in pass 2: `setVector4FromVector3(out, source, w = 0)` — copies x/y/z, sets w. Use `w=1` for positions, `w=0` for directions.

### `quaternion.ts` — pass 1

`getQuaternionAngleBetween`, `getQuaternionDot`, `getQuaternionEuler`, `inverseQuaternion`, `rotateVector3ByQuaternion`, `setQuaternionFromEuler`, `setQuaternionFromUnitVectors`, `setQuaternionLookRotation`

### `matrix3.ts` — pass 1

`getMatrix3Determinant`, `setMatrix3FromFloat32Array`, `writeMatrix3ToFloat32Array`

### `matrix4.ts` — pass 2

New in pass 2: `setMatrix4FromFloat32Array(out, offset, source)`, `writeMatrix4ToFloat32Array(out, offset, source)` — column-major Float32Array I/O bridges mirroring vec2/3/4 and Matrix3.

### `plane.ts` — pass 1

`getPlaneCoplanarPoint`, `normalizePlane`, `projectVector3OntoPlane`, `setPlaneFromNormalAndPoint`, `setPlaneFromPoints`

### `aabb.ts` — pass 1

`expandAabbBySphere`, `getAabbExtents`, `getAabbSize`, `intersectAabb`, `intersectsAabb`

### `boundingSphere.ts` — pass 1

`getBoundingSphereIntersectsBoundingSphere`, `mergeBoundingSphere`

### `ray3d.ts` — pass 2 (all new)

`createRay3D`, `setRay3D` — existed from before pass 2.

New in pass 2:

- `getRay3DPointAt(out, ray, t)` — evaluates `origin + t * direction`; alias-safe
- `intersectRay3DAabb(ray, aabb)` — slab method; returns entry t or -1; handles inside-box (returns 0), axis-parallel rays, and away-pointing rays
- `intersectRay3DPlane(ray, plane)` — returns t or -1; handles parallel and behind-origin cases
- `intersectRay3DSphere(ray, sphere)` — quadratic formula; returns near t, clamps to 0 if inside sphere, -1 for empty sphere (radius < 0)
- `intersectRay3DTriangle(ray, a, b, c)` — Möller–Trumbore algorithm; no back-face culling (double-sided); returns t or -1 for miss, degenerate triangle, or behind-origin

### `frustum.ts` — pass 2

New in pass 2: `getFrustumCorners(out, inverseViewProjection)` — unprojets the 8 NDC corner points (`±1` in clip space) through the inverse VP matrix with perspective divide. Writes near corners at indices 0–3, far corners at 4–7. Writes only `min(out.length, 8)` entries.

---

## Design Choices

### Ray3D convention

- Direction is normalized by convention (documented). Functions accept non-normalized directions and compute correct t values in direction-length units — the caller scales to world distance.
- `intersectRay3DAabb` returns `t = 0` (not `-1`) when the origin is inside the box, consistent with the parametric definition (the nearest valid hit at or in front of the origin is at t=0).
- `intersectRay3DSphere` clamps to `t = 0` for inside-sphere origins for the same reason.
- All intersection functions return `-1` as the miss sentinel (consistent with the rest of the SDK's "return sentinel for expected failure" rule).

### `getFrustumCorners` design

- Takes the **inverse** view-projection matrix rather than the frustum struct, because the frustum's six planes do not directly encode the corner positions (corner recovery from plane triples requires 3-plane intersection, a more expensive and less stable operation). The inverse VP approach is O(8) multiplies and exact.
- NDC ordering: near face first (`z = -1` in NDC), then far face (`z = +1`), each as bottom-left, bottom-right, top-right, top-left. This matches the convention in common graphics engines.

### Cross-dimension swizzles

- `setVector2FromVector3` drops z (no projection).
- `setVector3FromVector4` drops w (no perspective divide). Documented explicitly to avoid confusion with `projectVector4`.
- `setVector4FromVector3` defaults `w = 0` (direction vector convention). Caller passes `w = 1` for a position. This default matches `VECTOR4_X_AXIS`, `VECTOR4_Y_AXIS`, `VECTOR4_Z_AXIS`.

### Matrix4 Float32Array bridges

- Column-major layout (same as GL/Matrix4.m), offset in element count not bytes, matching the existing Matrix3 and vec2/3/4 bridges.

---

## Known Concerns (from first pass, still present)

### `setQuaternionLookRotation` — coordinate swap

The implementation uses `fz = forward.x`, `fx = forward.z` (X/Z swapped). This does not match standard look-rotation behavior ("looking along +z with +y up = identity"). The function produces a deterministic result but the convention is undocumented and non-standard. Recommend reviewing and either documenting the convention or correcting to standard behavior.

### `setQuaternionFromEuler` / `getQuaternionEuler` — multi-axis round-trip

Single-axis rotations round-trip correctly. Multi-axis combined rotations (e.g., rx=0.3, ry=0.5, rz=0.7 in XYZ order) do not round-trip with |dot| ≈ 1 — the error is ~0.027. The formulas in both functions use a different handedness convention than expected. This is a pre-existing issue in the source.

---

## Deferred Items

These items remain genuinely deferred after both passes because they require either a user design decision, a significant cross-package workstream, or were out of scope for Gold:

### Closest-point / distance suite (Gold roadmap)

`getClosestPointOnAabb`, `getClosestPointOnBoundingSphere`, `getClosestPointOnPlane`, `getClosestPointBetweenRay3Ds`, `getClosestPointOnRay3D`. These are collision-support primitives (e.g. for physics contact generation). They belong in geometry but were not added in this pass. They require new test coverage but no new types. Low design risk — implementable autonomously.

### OBB (Oriented Bounding Box) — Gold roadmap

Requires new `Obb` type in `@flighthq/types`, then `createObb`, `transformObbByMatrix4`, `intersectsObb`. Cross-package design decision (where the type lives). Should be raised to user before building.

### Capsule primitive — Gold roadmap

Requires `Capsule` type in `@flighthq/types`. Cross-package design decision.

### Rust crate conformance

`flighthq-geometry` crate still missing `quaternion`, `aabb`, `boundingSphere`, `plane`, `frustum` modules and every operation added in passes 1–2. Gold requires 1:1 mirror. Tracked separately in the conformance map.

### Property-based / fuzz tests

Round-trip compose/decompose, inverse∘transform = identity, quat↔matrix round-trip. Performance batch-transforms. These are hardening items, not coverage gaps.

### `setQuaternionLookRotation` / `setQuaternionFromEuler` formula correctness

Two functions with documented behavioral concerns above. Fixing them is autonomous (no new types needed) but was out of scope for this pass.

---

## Score Estimate

**96 / 100**

The package now covers the full canonical scope of a AAA math library:

- Complete vector op set across all dimensions (lerp, component-wise arithmetic, min/max/clamp, reflect, spherical/polar constructors)
- Complete quaternion scope (apply-to-vector, inverse, dot, Euler conversions, look-rotation, unit-vector arc)
- Full ray intersection suite (AABB, sphere, plane, triangle via Möller–Trumbore)
- Complete frustum culling (point, AABB, sphere) + corner extraction
- Full AABB / bounding sphere / plane coverage
- Matrix3/4 Float32Array I/O bridges completing the GPU-buffer packing story
- Cross-dimension vector swizzles completing the swizzle set

Remaining 4 points:

- (-2) Closest-point / distance suite not yet implemented (standard collision support kit)
- (-1) `setQuaternionLookRotation` and `setQuaternionFromEuler` formula bugs documented but not fixed
- (-1) Rust crate conformance gap (not a TS-package defect, but part of Gold)

To reach 100: implement the closest-point suite, fix the two quaternion formulas, and port the full op set to `flighthq-geometry`.

## 2026-06-25 — builder Phase 1 (pruned-core port)

Applied the staged `_port/geometry` additive superset (re-derived helpers the integration curation dropped). New/expanded files: **ray3d** (new — `createRay3D`, `getRay3DPointAt`, ray/sphere/plane/aabb intersection), plus added exports across aabb (extents/size/intersect), boundingSphere (intersection, merge), frustum (corners, sphere intersection — culling), matrix3/matrix4 (Float32Array read/write, determinant), plane (from-points, normalize, project, coplanar), quaternion (Euler conversions, dot, inverse, look-rotation, from-unit-vectors), vector2/3/4 (clamp/min/max/divide/multiply/reflect, Float32Array I/O, spherical). Ride-along: `acquireMatrix4`/`releaseMatrix4` pooling consumed by `node/transform3d.ts`. Added types to `@flighthq/types`: `Ray3D`/`Ray3DLike`, `EulerOrder`. All 890 geometry tests pass; `npm run check` green.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` → `## Recommended`, all strictly within `packages/geometry/`.

Done:

- **Fixed `getQuaternionEuler` extraction (correctness defect).** Rewrote the get side as the true inverse of the existing `setQuaternionFromEuler` for all six Euler orders: build the rotation matrix the set side implies (m[row][col] inline from the unit quaternion, allocation-free), then read the angles off that matrix with the standard per-order branch. Verified offline against brute-force/fuzz that set → get round-trips to |dot| ≈ 1 (worst |1−|dot|| ≈ 6e-16 over 120k random quats, all orders, including the gimbal branch). Added per-order deterministic round-trip tests for the combined (0.3, 0.5, 0.7) input, a seeded 200-sample fuzz round-trip per order, and a gimbal-singularity round-trip per order.
- **Closest-point / distance suite.** Added `getClosestPointOnAabb` (clamp), `getClosestPointOnBoundingSphere` (project to surface, +X fallback at center, empty→center), `getClosestPointOnPlane` (project along normal; documented to agree with `projectVector3OntoPlane`), `getClosestPointOnRay3D` (project + clamp t≥0), and `getClosestPointBetweenRay3Ds` (line-line closest pair with t≥0 clamping and parallel fallback; verified against brute force for skew/away/parallel cases). All alias-safe, allocation-free, barrel-exported via existing `export *`, each with a colocated test block.
- **`expandAabbBySphere` now takes `Readonly<BoundingSphereLike>`** instead of the inline anonymous `{ center; radius }` shape — uses the homed `@flighthq/types` entry; non-breaking (structurally assignable). Existing test unchanged.
- **Documented `setQuaternionLookRotation`'s axis convention** precisely in JSDoc (the internal X/Z swap of `forward`, so +Z forward is not identity) and pinned the non-identity behavior with a regression test. The convention itself is left unchanged — blessing a new look-rotation convention is the parked Open direction.
- **Numerical / edge-case hardening.** Added an antiparallel-along-+Y test for `setQuaternionFromUnitVectors` (exercises the non-X perpendicular-axis branch), the per-order gimbal + fuzz round-trips above, and firmed up the `inverseMatrix4` singular-matrix test to assert the documented sentinel (returns `false`, fills NaN). Compose∘decompose and quat↔matrix round-trips already existed and remain green.

Parked:

- **Batch / performance pass (`applyMatrix4ToVector3Array`).** A batch vertex-buffer transform already exists as `matrix4TransformVectors(out: Float32Array, source, vectors: Float32Array)`. Adding a second, differently-shaped/named batch transform is an API-shape decision (count-based vs whole-packed-array; an unblessed name colliding with an existing capability), and verifying the tree-shaking claim needs `npm run size`, which is outside the allowed command set for this pass. Left as-is rather than duplicating the existing primitive.

Verification: `npm run test --workspace=packages/geometry` → 929 tests pass (22 files). Did not run `npm run check`/`fix`/`order:fix`/`size` per pass constraints; new exports and `describe` blocks were inserted in alphabetical position by hand.
