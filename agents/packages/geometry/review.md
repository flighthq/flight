---
package: '@flighthq/geometry'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/geometry.md
  - source
---

# geometry — Review

Evidence source: incoming bundle `builder-67dc46d64` (`incoming/builder-67dc46d64/head/packages/geometry/` + `changes.patch`). Findings are referenced as `67dc46d64:<path>`.

## Verdict

**solid — 90/100.** A broad, internally consistent, conventions-clean linear-algebra library that now covers the full canonical type roster (vec2/3/4, three matrix tiers, quaternion, rectangle, AABB/sphere/plane/frustum, and a first-class `Ray3D` with a complete intersection suite). The second builder pass closed the vector-symmetry and quaternion-scope holes the prior depth review (78/100) flagged and added ray casting. It stops short of _authoritative_ on three concrete, verifiable points: a genuinely wrong `getQuaternionEuler` extraction convention (multi-axis Euler round-trips fail), a small but real intersection-predicate **naming inconsistency** across the bounding-volume types, and the Rust crate lagging the TS surface. None of these is a design fork — all are within reach of a focused pass.

I assess **90, not the status's self-estimated 96**: the docked points are the two correctness/naming defects the status itself acknowledges plus the conformance gap, and the status under-weights the predicate-naming inconsistency (it is a public-API symmetry defect in a package whose whole value proposition is greppable symmetry).

## Status-doc verification (as-claimed → verified)

The distributed worker report (`builder-67dc46d64`, self-estimated 96/100) was checked claim-by-claim against the realized `dist/*.d.ts` surface and source. All structural claims hold:

- **890 tests across 22 test files** — verified: 890 `it/test` calls across 22 `*.test.ts` files; 23 source files, one colocated test each.
- **14 new exported functions** across ray3d/frustum/vector2-4/matrix4 — verified against the `.d.ts` surface (e.g. `getRay3DPointAt`, `intersectRay3D{Aabb,Plane,Sphere,Triangle}`, `getFrustumCorners`, `setVector2FromVector3`, `setVector3FromVector4`, `setVector4FromVector3`, `setMatrix4FromFloat32Array`, `writeMatrix4ToFloat32Array`).
- **Ray3D intersection suite** — verified. `intersectRay3DTriangle` is a textbook, correct Möller–Trumbore (det-guard `< 1e-10`, barycentric `u`/`v` bounds, `t > 0` front-of-origin gate); `-1` miss sentinel is consistent across the suite, matching the SDK sentinel rule.
- **`Ray3D`/`Ray3DLike`, `Frustum`/`FrustumLike`, `EulerOrder` homed in `@flighthq/types`** — verified (`packages/types/src/{Ray3D,Frustum,EulerOrder}.ts`).
- **Rust conformance gap** — verified: the bundle's `crates/flighthq-geometry/src/` gained `frustum.rs` + `ray3d.rs` but still has **no** `quaternion.rs`, `aabb.rs`, `boundingSphere.rs`, or `plane.rs`. The TS↔Rust mirror is materially incomplete.

The two **Known Concerns** the status carries forward are real and confirmed below; the status is honest about them.

## Present capabilities

- **Vectors (vec2/3/4):** the symmetry holes the prior depth review called out are closed. Component-wise `multiply`/`divide`/`min`/`max`/`clamp` and `reflect` now exist on all three; `interpolateVector3`/`interpolateVector4` join `interpolateVector2`. vec3 adds spherical constructors/extractors (`createVector3FromSpherical`, `getVector3Spherical`, `set/createVector3FromSpherical`) and `transformVector3ByMatrix3` (normal/TBN math). Float32Array bridges now span vec2/3/4. Cross-dimension swizzles (`setVector2FromVector3`, `setVector3FromVector4`, `setVector4FromVector3` with the `w=0` direction default) complete the dimension ladder, each documenting the drop/keep semantics.
- **Matrices:** 2D affine `Matrix`, `Matrix3`, `Matrix4` as before, now with `getMatrix3Determinant` and Matrix3/Matrix4 column-major Float32Array I/O bridges (`set/writeMatrix{3,4}From/ToFloat32Array`), completing the GPU-buffer packing story across all matrix tiers.
- **Quaternion:** deepened to canonical scope — `rotateVector3ByQuaternion`, `inverseQuaternion`, `getQuaternionDot`, `getQuaternionAngleBetween`, Euler get/set, `setQuaternionFromUnitVectors`, `setQuaternionLookRotation`, on top of the prior multiply/normalize/conjugate/slerp/fromAxisAngle/ fromMatrix4.
- **Bounding volumes:** AABB gains `getAabbExtents`/`getAabbSize`, `intersectAabb` (out-computed overlap box) + `intersectsAabb` (predicate), `expandAabbBySphere`. BoundingSphere gains `getBoundingSphereIntersectsBoundingSphere` and `mergeBoundingSphere`. Plane grows from a single signed-distance helper to a real primitive: `setPlaneFromPoints`, `setPlaneFromNormalAndPoint`, `normalizePlane`, `projectVector3OntoPlane`, `getPlaneCoplanarPoint`. Frustum adds `getFrustumCorners` (inverse-VP unprojection of the 8 NDC corners).
- **Ray3D (new, first-class):** `createRay3D`/`setRay3D`, `getRay3DPointAt`, and ray-vs-{AABB, sphere, plane, triangle} intersection — the picking/collision primitive the prior review flagged as the one missing AAA fixture.
- **Rectangle** remains the full-featured 2D type (contains/intersects/encloses, union, inflate, every edge/corner accessor); **infrastructure** (typed-array `reserve*` helpers, per-type `acquire*`/`release*` pools) is unchanged and clean.

Implementation quality stays high: functions read inputs into locals before writing `out` (alias-safe), divide/normalize paths guard zero, and JSDoc carries the convention notes.

## Gaps vs an authoritative math library

- **`getQuaternionEuler` extraction is wrong for multi-axis rotations (correctness defect, not an omission).** `setQuaternionFromEuler` matches the standard three.js per-order half-angle product (e.g. XYZ `x = s1·c2·c3 + c1·s2·s3`) and is correct. But `getQuaternionEuler` extracts angles with a matrix-derived convention whose order does not invert the set-side multiply order, so `set → get` only round-trips for single-axis inputs; a combined `(0.3, 0.5, 0.7)` XYZ rotation drifts ~0.027 in `|dot|`. This is a real bug in the _get_ side (the set side is the standard one), and it undermines the EulerOrder feature it ships with.
- **`setQuaternionLookRotation` uses a non-standard, undocumented axis convention.** The body reads `fz = forward.x; fx = forward.z` (X/Z swapped), so "look along +Z, +Y up" is **not** identity. Deterministic, but neither documented nor matching any common engine's look-rotation.
- **Closest-point / distance suite absent.** `getClosestPointOn{Aabb,BoundingSphere,Plane,Ray3D}` and `getClosestPointBetweenRay3Ds` — the standard collision-support kit that pairs with the new intersection suite — are not present. Pure omission, no new types, low design risk.
- **OBB and Capsule primitives absent.** Both need a new type in `@flighthq/types` first (an `Obb`/`Capsule`), so they are a cross-package design decision, not a within-package omission.
- **Rust crate behind the TS surface.** `quaternion`, `aabb`, `boundingSphere`, `plane`, and every op added in passes 1–2 are unported. Per the conformance goal (1:1 mirror) this is a Gold-blocking gap, though it is a crate defect, not a TS-package defect.

## Charter contradictions

The charter (`packages/geometry/charter.md`) is a **stub**: _What it is_ is seeded from the prior depth review, and _North star_, _Boundaries_, _Decisions_, and _Open directions_ are all `TODO`. There is therefore no blessed principle, boundary, or decision for the code to contradict — **no contradictions found**, but only because the charter says nothing to contradict yet. The fallback rubric (codebase-map AAA standard) is what the verdict above is measured against. Every assumption that fallback forced is surfaced under _Candidate open directions_.

## Contract & docs fit

Against the per-package contract and the codebase-map design constraints:

- **Types-first / homing:** correct. `Ray3D`/`Frustum`/`EulerOrder` and the `*Like` structural variants live in `@flighthq/types`; no cross-package type is defined inline in the package.
- **`sideEffects: false`, single root `.` export, no top-level side effects:** all confirmed (`package.json` declares `sideEffects: false`; `index.ts` is a thin barrel of `export *`; no `register*`/global mutation at module scope).
- **Full unabbreviated names, `out`-params, sentinels-not-throws:** honored throughout — every function carries the full type word, mutating functions take a leading `out`, intersection routines return `-1`/`null`-style sentinels rather than throwing.
- **`EulerOrder` as a closed string union is correct, not a registry candidate (fork B).** The six Euler orders are a mathematically fixed, non-growing set inside a tight conversion loop — exactly the closed-system exception fork B carves out. No drift here.
- **Contract-fit drift — intersection-predicate naming is inconsistent across the bounding-volume family.** The same "do these two volumes overlap?" predicate is spelled three different ways: `intersectsAabb(a, b)` (verb-`s` + type), `getBoundingSphereIntersectsBoundingSphere(a, b)` (`get` + full doubled type), and `isFrustumIntersecting{Aabb,Sphere}` (`is…ing`). In a package whose explicit value is greppable, globally self-identifying names, three patterns for one concept is a real symmetry defect a user must memorize around. This is the main reason the score sits below the status's 96 self-estimate. (Candidate revision: pick one form — the SDK boolean rule favors an `is*`/`has*`/`get*…` prefix, so `isAabbIntersectingAabb` / `isFrustumIntersecting*` would unify it, leaving `intersectAabb` as the out-computing overlap-box op.)
- **Contract-fit drift — `expandAabbBySphere` takes an inline `Readonly<{ center; radius }>` instead of `BoundingSphereLike`.** A `BoundingSphereLike` already exists in `@flighthq/types`; the inline anonymous shape is a structural-literal stand-in that bypasses the homed type and reads inconsistently with `setBoundingSphereFromAabb`/`expandAabbByPoint`. Candidate revision: accept `Readonly<BoundingSphereLike>`.
- **Package Map fit:** the codebase-map line ("rectangles, vectors, matrices, typed-array capacity helpers, and pools") is now **stale-by-omission** — it predates quaternion, the AABB/sphere/plane/frustum culling set, and `Ray3D`. Candidate revision to the Package Map: widen the geometry line to "…matrices, quaternion, bounding volumes (AABB/sphere/plane/frustum), and a Ray3D intersection primitive…".

## Candidate open directions

These are the questions the stub charter does not answer that the review had to assume — each feeds the charter's _Open directions_ / _Boundaries_ for the user to settle:

1. **Where is the boundary between `geometry` and picking/physics?** A `Ray3D` intersection suite now lives here. Does `geometry` own ray casting and the **closest-point/distance** collision-support kit (treating itself as the math substrate for `interaction`/physics), or does anything past pure value-math belong to a consumer package? The prior depth review explicitly deferred this; it is now load-bearing because the ray suite already crossed the line.
2. **OBB / Capsule — in or out of scope, and where does the type live?** Both are the obvious next bounding volumes, both need a `@flighthq/types` entry first. A Boundary/Decision is needed before building.
3. **The intersection-predicate naming convention.** Settle one canonical spelling for volume-overlap predicates (see Contract & docs fit). A small charter Decision would prevent the next bounding volume from inventing a fourth spelling.
4. **Quaternion convention contract.** What handedness / look-rotation convention does the SDK bless (the `setQuaternionLookRotation` "+Z forward = identity?" question), and is `getQuaternionEuler` expected to round-trip `setQuaternionFromEuler` for all orders? Fixing the get-side extraction is autonomous, but the _convention_ it should target is a charter-level Decision.
5. **Rust conformance as a release gate.** Is TS-package completeness allowed to land ahead of the `flighthq-geometry` mirror (current state), or is 1:1 crate parity a blocking gate for a package's status to advance? This is fork-adjacent (the conformance posture) and applies beyond geometry.
