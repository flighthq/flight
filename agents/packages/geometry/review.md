---
package: '@flighthq/geometry'
status: authoritative
score: 96
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - review.md (prior, 2026-08-25)
  - source (all 27 src modules, full read)
  - tests (1,238 tests / 28 files, all passing)
  - git log since 2026-08-08 (36 geometry commits)
---

# geometry -- Review

Evidence source: live worktree (`packages/geometry/src/`). Rereview superseding the 2026-08-25 revision (authoritative, 92/94). 36 commits have landed since the 2026-08-08 status date, addressing the majority of prior gaps: `setPerspectiveMatrix4` parameter renamed to `tanHalfFovY`, `translateMatrix` out-param contract fixed (writes all 6 fields via `setMatrix`), OBB hot paths deallocated to scalar locals, pool guards fully built (`enableGeometryPoolGuards`/`disableGeometryPoolGuards`/`areGeometryPoolGuardsEnabled`), all four missing pair predicates landed (`isAabbIntersectingSphere`, `isObbIntersectingSphere`, `isCapsuleIntersectingAabb`, `isFrustumIntersectingObb`), all missing conventional singles landed (`transformRay3DByMatrix4`, `getQuaternionAxisAngle`, `crossVector2`, `rotateVector2`, `getVector2Angle`), `transformVector3ByMatrix3` now takes `Matrix3Like`, and all doc/style nits (`byte offset` -> element offset, `var` relics) are cleaned up.

## Verdict

**authoritative -- 96/100.** The package is a mature, well-tested linear-algebra substrate. Every gap docked in the prior review is fixed: the perspective parameter is correctly named, the out-param contract is upheld across every function, OBB hot paths are allocation-free, and pool guards are fully operational. The remaining 4 points come from: a residual naming divergence across four independent patterns (containment, enclosing, rectangle intersection, matrix4 transform naming), the three-tier singularity policy inconsistency, and two undecided boundary contracts (zero-length ray out-params, `__getAxisRotation` axis normalization precondition).

## Status-doc verification (as-claimed -> verified)

The 2026-08-08 status Open items were checked against source:

- **`setPerspectiveMatrix4` parameter named `fov`:** FIXED. Parameter is now `tanHalfFovY` (`matrix4.ts:1194`), JSDoc states "tan(fovY / 2), not the angle itself" (`matrix4.ts:1190`). `createPerspectiveMatrix4` carries the same name and doc (`matrix4.ts:406-410`).
- **Four absent pair predicates:** FIXED. `isAabbIntersectingSphere` (`aabb.ts:249`), `isObbIntersectingSphere` (`obb.ts:365`), `isCapsuleIntersectingAabb` (`capsule.ts:191`), `isFrustumIntersectingObb` (`frustum.ts:113`) all present.
- **Absent conventional singles:** FIXED. `transformRay3DByMatrix4` (`ray3d.ts`), `getQuaternionAxisAngle` (`quaternion.ts`), `crossVector2` (`vector2.ts:72`), `rotateVector2` (`vector2.ts:297`), `getVector2Angle` (`vector2.ts:104`) all present. `decomposeMatrixToTransform2D` (`transform2d.ts:37`) provides the 2D SRS decompose (lossless, handles skew).
- **`transformVector3ByMatrix3` inline type:** FIXED. Now takes `Matrix3Like` (`vector3.ts:495`).
- **`__getAxisRotation` no-normalize:** Documented precondition, verified unchanged. Matches `setQuaternionFromAxisAngle` contract.
- **Doc/style hygiene:** FIXED. No `byte offset` misstatements remain; no `var` relics in `matrix.ts` or elsewhere.
- **No `crates/` directory:** Verified unchanged. Crate stamp points at flight-rs repo.
- **Zero-length-direction contract:** Remains undecided for out-param ray functions (status accurately reflects this).

## Present capabilities

- **Vectors (vec2/3/4):** full symmetric op set -- add/subtract/scale/negate/normalize/dot/distance/length (plus squared variants), clamp/min/max/multiply/divide/reflect, interpolate, nearEquals. Vec2 adds `crossVector2` (2D wedge product), `rotateVector2` (counter-clockwise by radians), `getVector2Angle` (atan2 from +x), `setVector2FromPolar`, `setVector2FromVector3`, and `reflectVector2`. Vec3 adds `crossVector3`, `transformVector3ByMatrix3`, `transformVector3ByMatrix4`, `transformVector3ByQuaternion`, `setVector3FromSpherical`, `projectVector3OnPlane`, `reflectVector3`. Vec4 has `transformVector4ByMatrix4`. All tiers have Float32Array bridges, axis constants, polar/spherical constructors where relevant, `Readonly<T>` throughout.
- **Matrices:** 2D affine `Matrix` (6-element; transform-point/vector/bounds/rectangle, inverse with boolean sentinel, rotate/scale/translate families fully writing `out` via `setMatrix`, gradient/transform constructors, Float32Array bridge). `Matrix3` (9-element row-major; inverse with affine fast path, transpose, determinant, `setMatrix3NormalFromMatrix4`, cross-tier converts, `extractMatrix3FromMatrix4`). `Matrix4` (16-element column-major; multiply/append/prepend/rotate/scale/translate, compose/decompose TRS with negative-determinant handling, lookAt, orthographic/perspective with correctly-named `tanHalfFovY`, batch `matrix4TransformVectors`, row/column accessors, Float32Array bridges). Radians uniformly across all rotation entry points.
- **Quaternion:** multiply, conjugate/inverse, normalize, dot/angleBetween, slerp (shorter-arc + nlerp fallback at near-antipodal), axis-angle round-trip (`setQuaternionFromAxisAngle`/`getQuaternionAxisAngle`), Euler get/set (six orders, round-trip guaranteed), from-matrix/to-matrix, `setQuaternionFromUnitVectors` with antiparallel branch, standard +Z-forward/+Y-up look rotation.
- **Rectangle:** contains-point (scalar and XY), equals/nearEquals, enclosesRectangle, mergeRectangle, intersectsRectangle, computeRectangleIntersection, inflate, empty, from-points/from-bounds, transform by Matrix, Float32Array bridge.
- **Bounding volumes:** `Aabb` (contains/expand/union/intersect/closest-point/from-points/transform-by-Matrix4, `isAabbIntersectingAabb`, `isAabbIntersectingSphere`). `BoundingSphere` (merge, from-AABB, transform with max-scale radius, closest-point, `isBoundingSphereIntersectingBoundingSphere`, empty-sphere sentinel radius < 0 respected). `Plane` (from-points/normal+point, normalize, signed distance, project, coplanar point, closest-point). `Frustum` (Gribb-Hartmann extraction, `isFrustumContainingPoint`, `isFrustumIntersectingAabb`/`Obb`/`Sphere`, inverse-VP corner recovery). `Obb` (SAT 15-axis vs OBB/AABB, ray slab test in local space, closest-point, Matrix4 transform composing rotation via Shepperd, `isObbIntersectingObb`/`Aabb`/`Sphere` -- all hot paths now scalar, no per-call allocation). `Capsule` (capsule/capsule via Ericson segment-segment distance, `isCapsuleIntersectingCapsule`/`Sphere`/`Aabb`, ray body+caps test, closest-point).
- **Ray3D:** point-at, closest-point on-ray/between-rays (clamped, parallel fallback), intersect vs AABB/plane/sphere/triangle (Moller-Trumbore)/OBB/capsule, `transformRay3DByMatrix4`. `-1` miss sentinel and inside-returns-0 convention consistent across the suite.
- **Transform carriers:** `createTransform2D` (translation/rotation/scale/skew/pivot; `decomposeMatrixToTransform2D` lossless for 2D affine, outputs degrees). `createTransform3D` (translation/rotation/scale/pivot; `composeMatrix4FromTransform3D`/`decomposeMatrix4ToTransform3D`).
- **Pool infrastructure:** symmetric pools for Matrix/Matrix3/Matrix4/Quaternion/Rectangle/Vector2/3/4, each with `acquire*`/`acquireIdentity*`-or-`acquireEmpty*`/`release*`/`clear*Pool`. `EntityRuntimeKey` cleared on release to prevent retention leaks. Opt-in `enableGeometryPoolGuards()`/`disableGeometryPoolGuards()`/`areGeometryPoolGuardsEnabled()` emit per-release double-release warnings through `@flighthq/log` `logOnce`.
- **Typed-array helpers:** `reserveFloat32Array`/`reserveFloat64Array`/`reserveUint32Array`/`reserveInt32Array`/`reserveUint16Array`/`reserveInt16Array` capacity helpers.

Quality: inputs read into locals before writing `out` (aliasing tested), zero-length/degenerate guards on divide/normalize paths, `Readonly<T>` throughout. 1,238 tests across 28 colocated files, `describe` blocks mirroring exports.

## Gaps

- **Residual one-concept-many-spellings across four patterns:** (1) Containment: `containsAabbPoint`/`containsBoundingSpherePoint`/`containsRectanglePoint` but `isFrustumContainingPoint`. (2) Smallest-enclosing: `unionAabb` vs `mergeBoundingSphere` vs `mergeRectangle`. (3) Rectangle intersection: `intersectsRectangle` remains outside the `is*Intersecting*` spelling the 2026-07-01 Decision established for 3D volumes (and is consumed cross-package by `spatial`/`clip`/`interaction`). (4) Matrix4 transform family: `matrix4TransformPoint`/`Vector`/`Vectors` are type-first while the rest of the SDK spells `transform<Type>By<Type>`.
- **Inconsistent singularity policy across matrix tiers:** `inverseMatrix4` treats `|det| <= 1e-6` (absolute, scale-dependent) as singular and NaN-fills; `inverseMatrix3` uses exact `det === 0` and NaN-fills; 2D `inverseMatrix` uses exact `det === 0` and writes zeroed-linear/negated-translation. Three policies for one concept.
- **`__getAxisRotation` axis normalization:** the internal rotation builder does not normalize its axis input (`matrix4.ts`), so a non-unit axis silently yields a scaling matrix. Documented precondition matching `setQuaternionFromAxisAngle`, but exposed through three public rotation entry points whose callers may not read the doc. A guard-layer candidate.
- **Zero-length-direction contract undecided for out-param ray functions:** the scalar intersection functions return `-1` for zero-length direction (not a ray, never a hit), but `getClosestPointBetweenRay3Ds` has no sentinel return and writes ray `a`'s origin rather than the projection of `b`'s origin onto `a`.
- **Missing 3D box-contains-box:** 2D has `enclosesRectangle`, no 3D equivalent (`containsAabbAabb`/`containsObbPoint`).

## Charter contradictions

None. The prior review's three charter contradictions (OBB per-call allocations, `translateMatrix` partial out write, unbuilt pool guards) are all resolved. The 2026-07-01 Decisions (predicate naming, closest-point suite, types homing) and the 2026-07-03 Decision (pool guards) are faithfully implemented. The North star's "pure, alias-safe value-math, allocation-free in hot loops, out-param" is upheld throughout. The `__getAxisRotation` axis normalization is a documented precondition, not a contradiction of the charter's correctness principle -- it matches `setQuaternionFromAxisAngle`'s identical contract.

## Contract & docs fit

- **Package side:** clean. Types homed in `@flighthq/types` (including Obb/Capsule per Decision). `sideEffects: false`. Two export lanes: curated public `.` with 389 named exports, full `./contract` star-re-exporting 27 modules. Full unabbreviated names. Sentinels not throws (throws only for genuine programmer errors: out-of-range row/column, zero aspect ratio). Dependencies: `entity`, `log`, `math`, `types` only. Pool guards emit through `@flighthq/log` via the diagnostics convention (`enable*Guards` pattern). `Readonly<T>` throughout.
- **Crate stamp:** `flighthq-geometry` points at the separate flight-rs repo. No `crates/` directory in this repo. Conformance framing in this cell should reference the external repo, which it does.
- **Candidate revisions:** (a) The codebase-map geometry line accurately names OBB/capsule/Ray3D/closest-point since the prior revision's update. (b) The status.md Open section has not been rewritten since 2026-08-08 and lists 8 items, 6 of which are now fixed -- it needs a rewrite to stay true to the "present tense, rewritten in place" contract. (c) The charter's Open direction #5 (absent pair predicates) and #6 (conventional singles) are resolved and can be struck.

## Candidate open directions

1. **Finish the naming unification the 2026-07-01 Decision started** -- one spelling for containment (`contains*` vs `is*Containing*`), one for smallest-enclosing (`union*` vs `merge*`), whether `intersectsRectangle` joins `is*Intersecting*` (cross-package consumers in `spatial`/`clip`/`interaction`), and the `matrix4Transform*` -> `transform*ByMatrix4` family rename.
2. **Singularity policy** -- one documented rule for "singular matrix" across the three tiers (exact zero vs magnitude-relative epsilon; NaN-fill vs degenerate-fill).
3. **Obb/Capsule field shape** -- both are flattened scalars (`centerX`...) while Aabb/BoundingSphere nest `Vector3Like`; is flat-scalar the blessed shape for new volume types (`@flighthq/types` design)?
4. **Zero-length ray direction contract for out-param functions** -- extend the "not a ray" rule from scalar intersection to closest-point, and define what they write when it applies.
5. **3D containment completeness** -- `containsAabbAabb`, `containsObbPoint`, and any other 3D volume-vs-volume containment tests analogous to 2D `enclosesRectangle`.
6. **Wasm `-rs` mixing leaf** (charter fork D) -- unchanged; a flight-rs-repo concern.
