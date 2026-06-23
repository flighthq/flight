# Maturation Roadmap: @flighthq/geometry

**Current verdict:** solid — 78/100; structure, conventions, and implementation rigor are already at the target bar, but per-type operation sets have real, non-design holes (asymmetric vector ops, a thin quaternion). One focused pass from authoritative.

This package is unusual: it is already near the top tier, so Bronze and Silver are mostly **operation-coverage fill** rather than architecture, and the genuine frontier (Gold) is a `Ray`/intersection primitive set, Rust-crate conformance, and SIMD-class performance. All additions follow the existing file-per-type, free-function, out-param, alias-safe, pooled style; new shared types go in `@flighthq/types` first.

## Bronze

The 20% that removes the most glaring asymmetries and absences. All are missing-by-omission, additive, and matchable to existing precedent (`interpolateVector2`, `slerpQuaternion`, `interpolateMatrix4`).

- **Vector lerp symmetry** — `interpolateVector3(out, a, b, t)` and `interpolateVector4(out, a, b, t)` to match `interpolateVector2`. Highest-value single fix; closes the most-cited hole.
- **Component-wise vector arithmetic across vec2/3/4** — `multiplyVector2/3/4` (Hadamard) and `divideVector2/3/4` (zero-guarded per component), mirroring the existing `addVector*`/`subtractVector*`.
- **Per-component min/max/clamp across vec2/3/4** — `minVector2/3/4`, `maxVector2/3/4`, `clampVector2/3/4(out, value, min, max)`. Staple in glMatrix/three.js/Unity.
- **`reflectVector2/3/4(out, incident, normal)`** — reflect across a unit normal; canonical for physics/lighting; absent on all three.
- **Quaternion apply-to-vector** — `rotateVector3ByQuaternion(out, vector, quaternion)`. The single most-used quaternion operation and currently missing.
- **`inverseQuaternion(out, source)`** and **`getQuaternionDot(a, b)`** — inverse (correct for non-unit quats, unlike the present `conjugateQuaternion`) and dot, both needed before any further quaternion work.
- **`getMatrix3Determinant`** — mirrors `getMatrix4Determinant`; trivial symmetry fix.

## Silver

Brings every type to the operation depth a well-regarded math library (glMatrix, three.js math, cgmath) ships, plus the cross-family transforms and constructors that the asymmetries expose.

- **Quaternion to canonical scope:**
  - `setQuaternionFromEuler(out, x, y, z, order?)` / `getQuaternionEuler(out, source, order?)` — add a `EulerOrder` string-kind (`'XYZ'` default) in `@flighthq/types`.
  - `setQuaternionFromUnitVectors(out, from, to)` — shortest-arc rotation between two directions.
  - `getQuaternionAngleBetween(a, b)` and `setMatrix4FromQuaternion` forward partner `setQuaternionFromMatrix3` / a `quaternionToMatrix4` already covered by `setMatrix4FromQuaternion` (confirm both directions exist).
  - `setQuaternionLookRotation(out, forward, up)` — orientation from a look direction.
- **Vec3 ↔ Matrix3 transforms** — `transformVector3ByMatrix3(out, vector, matrix)` (and the inverse-transform partner) for normal/TBN math; `setMatrix3NormalFromMatrix4` exists to build the matrix but nothing consumes it.
- **Vec3 spherical/polar constructors** — `createVector3FromSpherical` / `setVector3FromSpherical(out, radius, theta, phi)` and `getVector3Spherical`, mirroring vec2's `createVector2FromPolar`.
- **Float32Array bridges for vec3/vec4 and Matrix3** — `setVector3FromFloat32Array` / `writeVector3ToFloat32Array` (and vec4, Matrix3) to match the vec2 and Matrix/Matrix4 bridges; needed for GPU buffer packing parity.
- **Plane promoted from frustum-support to a real primitive** — `setPlaneFromPoints(out, a, b, c)`, `setPlaneFromNormalAndPoint(out, normal, point)`, `normalizePlane(out, source)`, `projectVector3OntoPlane(out, point, plane)`, `getPlaneCoplanarPoint`.
- **AABB / sphere completeness** — `getAabbSize` / `getAabbExtents`, `intersectsAabb(a, b)`, `intersectAabb` (overlap region), `expandAabbBySphere`, `intersectsBoundingSphere`, `mergeBoundingSphere`. (`union`, `fromPoints`, `expandByPoint`, `transformAabbByMatrix4` already present.)
- **Matrix consistency pass** — reconcile the `matrix4TransformPoint` vs `matrixTransformPoint` verb-position split (decide one convention, rename the minority; pre-release, so do it now); add a `getMatrix4ScaleRotationTranslation`-style decompose convenience if not covered by `decompose`.
- **Degrees/radians helpers** — `convertDegreesToRadians` / `convertRadiansToDegrees` and an `approximatelyEquals(a, b, epsilon?)` scalar, if not already living in a shared math util; keep them here only if no other package owns scalar math.

## Gold

Authoritative: the frontier features, exhaustive edge/error handling, performance, and 1:1 Rust conformance.

- **`Ray` primitive and intersection suite** (pending the boundary decision below) — `Ray` type in `@flighthq/types`, `createRay`/`setRay`/`getRayPointAt`, and `intersectRayAabb`, `intersectRaySphere`, `intersectRayPlane`, `intersectRayTriangle` (Möller–Trumbore), each returning a `number` t-sentinel of `-1` on miss. Also `LineSegment` + `getClosestPointOnSegment`, `intersectSegmentSegment` for 2D.
- **Closest-point / distance suite** — `getClosestPointOnAabb`, `getClosestPointOnPlane`, `getClosestPointBetweenSegments`, `getDistancePointToSegment`; the standard collision-support kit.
- **OBB and capsule volumes** — `Obb` (oriented bounding box) type + `createObbFromAabb`, `transformObbByMatrix4`, `intersectsObb`; optional `Capsule` for character-collision parity with mature engines.
- **Frustum depth** — `intersectsFrustumBoundingSphere`, `intersectsFrustumObb`, plane-normalization on extraction, and `getFrustumCorners`.
- **Swizzle / construction conveniences** — `setVector4FromVector3` (w default), `setVector3FromVector4` (drop w / perspective divide variants made explicit), `setVector2FromVector3`; round out the cross-dimension casts now scattered (`projectVector3`/`projectVector4`).
- **Performance pass** — confirm hot transforms/multiplies are allocation-free and alias-safe under fuzz; add `applyMatrix4ToVector3Array(out, source, count, matrix)` style batch transforms for vertex buffers; document/measure against `npm run size` so the math core stays tree-shakable.
- **Edge-case & numerical hardening** — explicit handling and tests for degenerate input (zero-length normalize already guarded; extend to `setQuaternionFromUnitVectors` antiparallel case, gimbal at ±90° in Euler conversions, singular matrix inverse returning a sentinel/identity per documented contract). Property-based tests (round-trip compose/decompose, inverse∘transform = identity, quat↔matrix round-trip).
- **Rust-crate conformance (`flighthq-geometry`)** — the crate currently has `vector2/3/4`, `matrix/matrix3/matrix4`, `rectangle`, `typedarray`, `pool(s)` but is **missing `quaternion`, `aabb`, `boundingSphere`, `plane`, `frustum`** and every Bronze/Silver op above. Gold requires the crate to be a 1:1 mirror: add the missing modules, port the full op set with `snake_case` names carrying the full type word, `&mut`/out alias-safe semantics, and conformance assertions in `flighthq-functional`. This is a real, sizable workstream, not polish.
- **Docs** — a short geometry concepts doc (coordinate conventions: row/column-major, handedness, packed-RGBA color note already elsewhere, radian convention, premultiplied transform order) under `tools/agents/docs` so the matrix-multiply order and matrix-tier suffixes are stated once authoritatively.

## Sequencing & effort

Recommended order, with dependencies and cross-package / design items to surface.

1. **Bronze, one session.** All seven items are pure additions to existing files (`vector2/3/4.ts`, `quaternion.ts`, `matrix3.ts`) with colocated tests; types already exist in `@flighthq/types`. No new files, no cross-package coupling. Run `npm run exports:check`, `npm run order:fix`, `npm run fix`, then `npm run check`. Half-day to a day.
2. **Silver, one to two sessions.** Quaternion-to-canonical and the vec3↔Matrix3 transforms first (they unblock 3D consumers in `scene`/`mesh`/`camera`); then Float32Array bridges (unblock GPU packing); then Plane/AABB/sphere depth. **New type needed in `@flighthq/types`: `EulerOrder` string-kind** — define it there before implementing the Euler functions. The matrix verb-position reconciliation is a **rename touching `matrix4.ts` and every caller** — cheap now (pre-release, no consumers), do it early in Silver while the surface is small. Surface to the user: where degrees/radians and `approximatelyEquals` scalar helpers should live (geometry vs a future shared math util) — a boundary decision, not an autonomous add.
3. **Gold, multi-session.** Two genuinely large workstreams, sequence them apart:
   - **Ray/intersection + closest-point + OBB.** Blocked on a **design decision to surface, not resolve here**: does the `Ray`/picking/intersection primitive set belong in `@flighthq/geometry`, or in `@flighthq/interaction` (where hit-testing lives) / `@flighthq/scene`? The depth review flagged this as a boundary question. Resolve with the user before building; if `geometry` wins, `Ray`/`LineSegment`/`Obb` types go in `@flighthq/types` first.
   - **Rust conformance.** Independent of the TS frontier and can proceed in parallel by a Rust-focused session: add the five missing crate modules, then keep the crate in lockstep as TS Bronze/Silver land. This is the largest single effort and the gating item for "authoritative" given native-first parity is a hard goal. Track via `flighthq-functional` conformance scenes and the conformance map.
   - Performance batch-transforms and property-based hardening last, once the op surface is frozen; verify with `npm run size` and `npm run ci`.

Cross-package notes: no consumer of `geometry` needs to change for Bronze/Silver (additive). The Euler-order type addition and any `Ray` types are the only `@flighthq/types` edits required. Keep `"sideEffects": false` and the single root `.` export intact — every addition is a barrel re-export from `index.ts`.
