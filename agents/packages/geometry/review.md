---
package: '@flighthq/geometry'
status: authoritative
score: 92
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-06-24)
  - assessment.md (prior, 2026-07-03)
  - source (all 25 src files, full read)
  - tests (coverage-shape skim, 961 tests / 25 files)
  - git log since 2026-06-24 (9 geometry commits)
---

# geometry — Review

Evidence source: live worktree (`packages/geometry/src/`). Rereview superseding the 2026-06-24 bundle review (solid, 90); 9 commits have landed since, including the OBB/Capsule build-out, the predicate renames, the look-rotation/Euler fixes, the Matrix4 radians flip, and the `setPerspectiveMatrix4` m[15] fix.

## Verdict

**authoritative — 92/100.** Every blocker the prior review docked points for is fixed, and the canonical roster is now genuinely complete: `getQuaternionEuler` is the true inverse of `setQuaternionFromEuler` for all six orders (per-order deterministic + seeded-fuzz + gimbal round-trip tests), `setQuaternionLookRotation` uses the standard +Z-forward/+Y-up = identity convention, the intersection predicates are unified on `is*Intersecting*` per the 2026-07-01 Decision, the closest-point suite exists, and OBB + Capsule landed with types homed in `@flighthq/types` (SAT 15-axis tests, ray intersection, closest-point, Matrix4 transform). What separates it from easing's 96 is a short tail of real defects: a `translateMatrix` out-param contract bug, a mislabeled `setPerspectiveMatrix4` parameter that forces a caller-side warning comment in `camera`, per-call allocations in the OBB hot paths, residual one-concept-two-spellings naming, and the Approved-but-unbuilt pool guards.

## Status-doc verification (as-claimed → verified)

Both 2026-07-09 entries check out against source: `rotateMatrix4`/`appendRotationMatrix4`/`prependRotationMatrix4` take **radians** (`__getAxisRotation` negation preserved, JSDoc points at `DEG_TO_RAD`), and `setPerspectiveMatrix4` writes `m[15] = 0` with a durable comment explaining the `w = -z` requirement. The 2026-07-01 decisions are realized: `isAabbIntersectingAabb`, `isBoundingSphereIntersectingBoundingSphere`, `isObbIntersectingObb/Aabb`, `isCapsuleIntersectingCapsule/Sphere` all follow the blessed spelling; `Obb`/`ObbLike`, `Capsule`/`CapsuleLike` live in `packages/types/src/`.

## Present capabilities

- **Vectors (vec2/3/4):** full symmetric op set (add/subtract/scale/negate/normalize/dot/distance/length ± squared, clamp/min/max/multiply/divide/reflect, interpolate, nearEquals), polar/spherical constructors, Float32Array bridges, cross-dimension swizzles with documented drop/keep semantics, axis constants.
- **Matrices:** 2D affine `Matrix` (transform-point/vector/bounds/rectangle, inverse with boolean sentinel, gradient/transform constructors, Float32Array bridge), `Matrix3` (row-major; inverse with affine fast path, transpose, determinant, `setMatrix3NormalFromMatrix4` normal matrix, cross-tier converts), `Matrix4` (column-major; multiply/append/prepend/rotate/scale/translate, compose/decompose ↔ TRS with negative-determinant handling, lookAt, orthographic/perspective, batch `matrix4TransformVectors`, row/column accessors, Float32Array bridges). Radians uniformly across all rotation entry points.
- **Quaternion:** canonical scope — multiply, conjugate/inverse, normalize, dot/angleBetween, slerp with shorter-arc + nlerp fallback, axis-angle, Euler get/set (six orders, round-trip guaranteed), from-matrix/to-matrix, `setQuaternionFromUnitVectors` with antiparallel branch, standard-convention look rotation.
- **Bounding volumes:** `Aabb` (contains/expand/union/intersect/closest-point/from-points/transform-by-Matrix4 center-extent method), `BoundingSphere` (merge, from-AABB, transform with max-scale radius, closest-point, empty-sphere sentinel radius < 0 respected throughout), `Plane` (from-points/normal+point, normalize, signed distance, project, coplanar point, closest-point), `Frustum` (Gribb–Hartmann extraction, point/AABB/sphere tests, inverse-VP corner recovery), **`Obb`** (SAT vs OBB/AABB, ray slab test in local space, closest-point, Matrix4 transform composing rotation via Shepperd), **`Capsule`** (capsule/capsule via Ericson segment-segment distance, capsule/sphere, ray body+caps test, closest-point).
- **Ray3D:** point-at, closest-point on-ray/between-rays (clamped, parallel fallback), intersect vs AABB/plane/sphere/triangle (Möller–Trumbore)/OBB/capsule; `-1` miss sentinel and inside-returns-0 convention consistent across the suite.
- **Infrastructure:** `reserve*` typed-array capacity helpers; symmetric pools for Matrix/Matrix3/Matrix4/Quaternion/Rectangle/Vector2/3/4, each with `acquire*`/`acquireIdentity*`-or-`acquireEmpty*`/`release*`/`clear*Pool`.

Quality holds the house style: inputs read into locals before writing `out` (aliasing tested), zero-length/degenerate guards on divide/normalize paths, `Readonly<T>` throughout, conventions carried in JSDoc. 961 tests across 25 colocated files, `describe` blocks mirroring exports.

## Gaps

- **`translateMatrix` / `translateMatrixByVectorXY` violate the out-param contract** (`matrix.ts`): they write only `tx`/`ty`, so when `out !== source` the linear part (a, b, c, d) is left stale. Every other `<verb>Matrix*(out, source, …)` fully writes `out` (`translateMatrix4` does `out.m.set(source.m)`). Also missing `: void` return annotations on `translateMatrixByVector`/`XY`.
- **`setPerspectiveMatrix4`'s `fov` parameter is actually tan(fovY/2), undocumented at the source** (`matrix4.ts`: `top = fov * zNear`). The consumer carries the compensating comment (`packages/camera/src/projection.ts`: "takes the tangent of the half-FOV, not the full angle") — precisely the caller-side warning comment the diagnostics rule bans. The parameter name lies; whether the function should take an angle like GLM/three.js is a design fork, but naming/documenting the current contract is not.
- **OBB hot paths allocate per call** (`obb.ts`): `obbLocalAxes` returns a fresh 9-tuple array, `intersectRay3DObb` builds three temporary arrays, and `obbSatSeparated` creates an `onAxis` closure per invocation — in the package that promises allocation-free math in hot loops. Scalar locals or module-scratch would fix all three.
- **Missing pair predicates on existing types:** sphere↔AABB (`isAabbIntersectingSphere`, the textbook Arvo test), OBB↔sphere, capsule↔AABB, frustum↔OBB; no 3D box-contains-box (2D has `enclosesRectangle`). All operate on already-homed types.
- **Missing conventional singles:** `transformRay3DByMatrix4` (picking against transformed geometry currently re-derives it), `getQuaternionAxisAngle` (inverse of the existing set), and a 2D kit — scalar `crossVector2`, `rotateVector2`, plain `getVector2Angle`. For data-viz/creative-tool use, 2D `Matrix` also lacks skew and a scale/rotation/skew decompose (the 2D sibling of `decomposeMatrix4`).
- **Residual one-concept-many-spellings:** containment is `containsAabbPoint`/`containsBoundingSpherePoint`/`containsRectanglePoint` but `isFrustumContainingPoint`; enclosing-both is `unionAabb` vs `mergeBoundingSphere` vs `mergeRectangle`; the 2D rectangle family kept `intersectsRectangle`/`computeRectangleIntersection` outside the 2026-07-01 predicate decision (and is consumed cross-package by `spatial`/`clip`/`interaction`); `matrix4TransformPoint/Vector/Vectors` are type-first while the rest of the SDK spells `transform<Type>By<Type>`.
- **Inconsistent singularity policy across matrix tiers:** `inverseMatrix4` treats `|det| ≤ 1e-6` (absolute, scale-dependent) as singular and NaN-fills; `inverseMatrix3` uses exact `det === 0` and NaN-fills; 2D `inverseMatrix` uses `det === 0` and writes a zeroed-linear/negated-translation degenerate instead. Three policies for one concept.
- **Doc nits:** several Float32Array bridges say "byte offset" where the offset is in elements; an orphaned transpose JSDoc block sits detached between `transposeMatrix4` and `writeMatrix4ToFloat32Array` in `matrix4.ts`; `var` relics in `rotateMatrix`.

## Charter contradictions

Two, both against the North star's "pure, alias-safe value-math … allocation-free in hot loops / out-param" principle: the **OBB per-call allocations** and the **`translateMatrix` partial `out` write** (above). Additionally, the **2026-07-03 Decision chartering `enableGeometryPoolGuards()` is unrealized** — no guard module exists anywhere in the tree; this is approved-but-unbuilt work rather than a code contradiction. All five 2026-07-01 Decisions are faithfully implemented.

## Contract & docs fit

- **Package side:** clean. Types homed in `@flighthq/types` (`Obb`/`Capsule` included per Decision); the one exception is `transformVector3ByMatrix3` (`vector3.ts`) taking an inline `Readonly<{ m: Readonly<Float32Array> }>` instead of `Matrix3Like` — same drift the prior review caught on `expandAabbBySphere`. `sideEffects: false`, single root `.` export, thin `export *` barrel, full unabbreviated names, sentinels-not-throws (throws only on out-of-range row/column and zero aspect — genuine programmer errors), deps `entity` + `types` only.
- **Docs side (candidate revisions):** (a) the codebase-map geometry line is now **current** (names OBB/capsule/Ray3D/closest-point) — charter Open direction #8 is resolved and can be struck; (b) the charter's "A faithful Rust mirror" North star and the CONTRACT `crate: flighthq-geometry` stamp predate the Rust split — **no `crates/` exists in this repo**; the crate lives in the separate flight-rs repo, so crate-conformance framing in this cell should point there; (c) the prior review/assessment items about `expandAabbBySphere` and predicate naming are done and their docs superseded by this revision.

## Candidate open directions

1. **Perspective parameter semantics** — keep tan-half-FOV (document + rename param) or switch to fovY radians like GLM/three.js (breaking for `camera`; greenfield-licensed but gated).
2. **Finish the naming unification the 2026-07-01 Decision started** — one spelling for containment (`contains*` vs `is*Containing*`), one for smallest-enclosing (`union*` vs `merge*`), and whether the 2D rectangle family (`intersectsRectangle`, cross-package consumers) joins `is*Intersecting*`; plus the `matrix4Transform*` → `transform*ByMatrix4` family question.
3. **Obb/Capsule field shape** — both are flattened scalars (`centerX`…) while Aabb/BoundingSphere nest `Vector3Like`; is flat-scalar the blessed shape for new volume types (`@flighthq/types` design)?
4. **Singularity policy** — one documented rule for "singular matrix" across the three tiers (exact zero vs magnitude-relative epsilon; NaN-fill vs degenerate-fill).
5. **Wasm `-rs` mixing leaf** (fork D) — unchanged from the charter; now explicitly a flight-rs-repo concern.
