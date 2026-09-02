---
package: '@flighthq/collision'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# collision — Review

## Verdict

solid — 82/100. The package has grown from a 2D-only phase-1 narrow phase into a unified 2D+3D collision system spanning seven shape kinds per dimension, discrete overlap tests, contact manifolds with feature ids, swept/time-of-impact queries, raycasts, point containment, shape validation, and a full diagnostics layer. The support-function registry (GJK/EPA) is the architectural centrepiece that makes the shape set extensible. The score reflects one concrete gap (2D capsule missing from the support registry, leaving `testCollision2D` unable to resolve capsule pairs), the absence of a 2D distance query (present in 3D), and the remaining chartered shapes (rounded polygon, concave decomposition).

## Present capabilities

### Architecture

- **Two-tier dispatch registry** — `collisionSupport2D.ts` / `collisionSupport3D.ts` host a pair-specialization registry (keyed by ordered kind pair, ten 2D SAT entries and seven 3D closed-form entries) above a support-function registry (GJK/EPA floor). Both are explicit-registration, last-write-wins, vendor-extensible. Nothing registers at module load.
- **Two export lanes** — `index.ts` (public, ~94 named exports) and `contract.ts` (full surface, `export *` from 34 modules). `sideEffects: false` declared. Dependencies: `@flighthq/geometry`, `@flighthq/log`, `@flighthq/types` only.
- **Vendor-shape type system** — `CollisionVendorShape2D` / `CollisionVendorShape3D` arms accept any dotted kind string; built-in kinds are closed literals, preserving exhaustive narrowing and compile-time dimension safety (the 2026-08-21 decision).

### 2D (seven shape kinds: circle, aabb, obb, polygon, capsule, segment, point)

- **Lean manifold tests** (`shapeCollision2D.ts`) — ten direct typed pair functions over the original four area shapes (circle, aabb, obb, polygon), plus a shared SAT core (`satConvexOverlap`). Normal pushes A out of B; touching exclusive; depth is min-separation (containment-correct). `testCollision2D` (`testCollision2D.ts`) dispatches through both registries with reverse-key negation.
- **Support functions** (`collisionSupport2D.ts`) — `supportCollisionAabb2D`, `supportCollisionCircle2D`, `supportCollisionObb2D`, `supportCollisionPolygon2D`. Registered by `registerBuiltInCollisionSupports2D`.
- **GJK/EPA floor** (`gjk2D.ts`) — `testCollisionSupport2D` (manifold) and `testCollisionSupportOverlap2D` (boolean). EPA accuracy documented: depth converges to tolerance, normal to approximately its square root on curved boundaries.
- **Contact manifolds** (`collideContactManifold2D.ts`, `shapeContact2D.ts`, `capsuleContact2D.ts`) — 15 contact pairs covering all area shapes including capsule. `collideContactManifold2D` dispatches by kind rank, negates normal on swap. Feature ids packed by positional multiplication (`contactFeatureId.ts`), bounded at 2^25 faces. Argument-order invariance documented: holds across kinds, cannot hold within a kind (the 2026-07-29 decision).
- **Sweep / time-of-impact** (`sweepCollisionShape2D.ts`) — exact first contact under linear translation. Circle-circle via quadratic root, circle-polygon via rounded face/vertex expansion, polygon-polygon via continuous SAT. Capsule sweep decomposes into two discs plus a rectangle (union is exact). `createCollisionTimeOfImpact2D` allocates the result.
- **Raycast** (`raycastCollisionShape2D.ts`) — first exact hit for all seven kinds including capsule (decomposed into rectangle + two discs), segment, and point. Origin-inside returns fraction 0. Scratch pooled.
- **Point containment** (`pointContainment2D.ts`) — `getCollisionShapeContainsPoint2D` for all seven kinds. Boundary-inclusive. Segment/point degrade to on-shape tests.
- **Segment queries** (`segmentCollision2D.ts`) — five `testSegment*Collision2D` booleans (aabb via Liang-Barsky, circle via closest-point, obb via local-frame, polygon via endpoint-inside + edge-crossing, segment-segment with collinear handling) plus `testSegmentCapsuleCollision2D` via segment-segment distance.
- **Shape validation** (`collisionShapeValidation2D.ts`) — `getCollisionShapeValidationStatus2D` classifies degenerate, non-convex, and unsupported shapes. `getCollisionPolygonValidationStatus2D` validates vertex count, finite coordinates, convexity (winding-agnostic), and positive area.

### 3D (seven shape kinds: sphere, aabb, box, capsule, cylinder, cone, convex)

- **Closed-form pair tests** (`shapeCollision3D.ts`) — `testSphereSphereCollision3D`, `testSphereAabbCollision3D`, `testSphereBoxCollision3D`, `testSphereCapsuleCollision3D`, `testCapsuleCapsuleCollision3D`, `testAabbAabbCollision3D`, `testBoxBoxCollision3D`. Registered by `registerBuiltInCollisionPairTests3D`.
- **Support functions** (`collisionSupport3D.ts`) — all seven kinds have support functions: sphere, aabb, box, capsule, cylinder, cone, convex. Registered by `registerBuiltInCollisionSupports3D`.
- **GJK/EPA floor** (`gjk3D.ts`) — `testCollisionSupport3D` (manifold), `testCollisionSupportOverlap3D` (boolean). Tetrahedron-based simplex, triangle-surface polytope expansion. EPA accuracy on curved boundaries documented: depth 1e-5, normal 5e-3, worst 15-degree error.
- **GJK distance** (`gjkDistance3D.ts`) — `writeCollisionDistance3D` reports gap, direction, and both witness points. Used by conservative advancement. Returns false on overlap.
- **Contact manifolds** (`collideContactManifold3D.ts`) — generic path: GJK for overlap, face-query clipping for contact points. `collisionFace3D.ts` provides the face registry with queries for aabb, box, capsule, and convex hull. Sphere/cylinder/cone have no faces (single-point fallback). Up to `MAX_COLLISION_CONTACT_POINTS_3D` points.
- **Triangle mesh and heightfield** (`triangleMesh3D.ts`) — `createCollisionTriangleMesh3D` / `createCollisionHeightfield3D` with retained BVH acceleration. `collideCollisionTriangleMesh3D` reduces multiple triangle contacts to a stable four-point patch. Raycast and sweep against both. Invalidation verbs for dynamic meshes.
- **Sweep / time-of-impact** (`sweepCollisionShape3D.ts`) — conservative advancement using `writeCollisionDistance3D`. 32-iteration budget, touch tolerance 1e-6. Reports midpoint witness.
- **Convex hull triangulation** (`convexHull3D.ts`) — `writeCollisionConvexHullFaces3D` via incremental construction. Used by 3D raycast and inertia computation.
- **Raycast** (`raycastCollisionShape3D.ts`) — all seven kinds, including convex hull via face-plane clipping.
- **Point containment** (`pointContainment3D.ts`) — all seven kinds. Convex hull via GJK against zero-radius sphere (needs registration).
- **Shape validation** (`collisionShapeValidation3D.ts`) — all seven kinds. No `non-convex-polygon` status (a 3D hull is always its own convex hull by support scan).

### Diagnostics

- **Guard layer** (`enableCollisionGuards.ts`) — `enableCollisionGuards` / `disableCollisionGuards` / `areCollisionGuardsEnabled`. Installs test guards for both 2D and 3D via `setCollisionTestGuard2D` / `setCollisionTestGuard3D`. Warns via `logOnce` on degenerate, non-convex, and unsupported shapes. Messages name the explain seam and the repair.
- **Explain queries** (`explainCollisionTest2D.ts`, `explainCollisionTest3D.ts`) — `explainCollisionTest2D` / `explainCollisionTest3D` classify invalid/unsupported inputs and distinguish a silent `false` sentinel from a genuine separation. Check pair and support registries for `'unsupported-shape-kind'`.

### Testing

- Every source file has a colocated `*.test.ts` — 36 source files, 36 test files.
- 497 individual test cases across 664 test blocks.
- Differential testing: 3D GJK results validated against all 2D SAT incumbents over 4000 seeded pairs. 3D sphere-sphere EPA accuracy measured against exact closed form. Capsule contact manifolds validated by push-to-separate and surface-point invariants over seeded overlapping pairs.
- ~17,210 total lines (source + test).

## Gaps

Against a mature 2D+3D narrow-phase library (Box2D / Bullet Physics class):

- **2D capsule missing from the support registry.** `registerBuiltInCollisionSupports2D` registers aabb, circle, obb, polygon. No `supportCollisionCapsule2D` exists. This means `testCollision2D` (the lean manifold test) returns `false` for any pair involving a capsule, even though the contact manifold dispatcher, sweep, raycast, and containment all handle capsules correctly. A user who registers pair tests and supports and then passes a capsule to `testCollision2D` gets a silent miss. The 3D side does register capsule (`supportCollisionCapsule3D`). This is the most actionable gap.
- **No 2D distance/closest-point query.** 3D has `writeCollisionDistance3D` (the GJK distance query used by conservative advancement). 2D has no equivalent. The 2D sweep uses exact continuous SAT instead of conservative advancement, so it does not need one operationally, but an overlap-distance query is a standard narrow-phase primitive for AI steering, proximity triggers, and signed-distance fields.
- **Rounded polygon** — chartered open direction, unstarted.
- **Concave-as-convex-decomposition** — chartered open direction, unstarted. 3D has `triangleMesh3D` for concave meshes; 2D has no analog.
- **2D capsule pair tests not in `registerBuiltInCollisionPairTests2D`.** The ten registered entries are the original four-shape SAT matrix. Capsule pairs go through the contact manifold dispatcher but not through the lean manifold pair registry. Adding five capsule entries (or a capsule support function) would close this.
- **No 3D segment/ray-segment queries.** 2D has five `testSegment*Collision2D` booleans; 3D has no segment-vs-shape overlap queries beyond raycast.
- **EPA tail on curved boundaries.** Documented and measured (worst-case 15-degree normal error on sphere-sphere). Mitigated by closed-form pair specializations for all curved 3D pairs. Not a defect, but a known conditioning bound.

## Charter contradictions

None found. All eight dated decisions hold in code:

- **[2026-07-10] Phased AAA build** — phase 1 complete, phase 2 (swept/TOI) complete for both dimensions, phase 3 (contact manifolds) complete for both dimensions. Capsule is complete except for the lean-manifold gap noted above.
- **[2026-07-10] Manifold-returning, out-parameter, allocation-free** — all lean manifold tests write to `out` and return boolean. Hot path allocates nothing (scratch pooled or module-level).
- **[2026-07-10] Shapes + CollisionManifold in @flighthq/types** — confirmed; all shape and manifold types live in `@flighthq/types`.
- **[2026-07-15] Unified 2D+3D package** — both dimensions coexist. `testCollision2D` / `testCollision3D` are the dimension-split entry points.
- **[2026-07-29] Phase 3 contact manifolds as a parallel lane** — `collideContactManifold2D` / `collideContactManifold3D` sit alongside `testCollision2D` / `testCollision3D`, each with their own manifold type.
- **[2026-07-29] Argument-order invariance** — documented in `collideContactManifold2D.ts` and `collideContactManifold3D.ts` comments. Holds across kinds, cannot hold within a kind. Feature ids packed by positional multiplication.
- **[2026-08-20] Support-function registry** — built. GJK/EPA core instantiated as `gjk2D` / `gjk3D`. Dimension boundary carried by shape types and entry points.
- **[2026-08-21] Vendor prefix as type** — `CollisionVendorShape2D` with dotted-kind template literal beside six closed built-in arms.

## Contract & docs fit

### How well the package lives up to the contract

- **Type home** — all exported types in `@flighthq/types`. Functions only from this package. Strong.
- **Full unabbreviated names** — `testCircleAabbCollision2D`, `collideAabbPolygonContactManifold2D`, `sweepCollisionShape3D` — every export is globally self-identifying with the full type name and dimension suffix. Strong.
- **Out-parameters** — consistently used for manifolds, raycast hits, time-of-impact, distance queries. `Readonly<>` on inputs. Strong.
- **Sentinels not throws** — `false` for misses, `null` for missing registrations, `'unsupported-shape-kind'` / `'degenerate-shape'` as validation statuses. No throws found in production paths. Strong.
- **Side-effect free** — `sideEffects: false` declared. No module-level registration. All registrations via explicit `register*` calls. Strong.
- **Diagnostics inversion** — `enableCollisionGuards` installs guards via `@flighthq/log`; `explainCollisionTest2D` / `explainCollisionTest3D` are the shakeable query seams. Matches the inversion rule.
- **Export lanes** — `index.ts` (public) and `contract.ts` (full). Contract re-exports all modules. Strong.

### Candidate contract/docs revisions

- **Package Map line in AGENTS.md** lists `collision` under "Game" with no description of its scope. The package now spans 2D and 3D narrow-phase collision, contact manifolds, swept tests, triangle meshes, heightfields, and a GJK/EPA core. The one-word listing understates the package.
- **The previous review.md** (dated 2026-08-25) described the package as having only phase 1 built, no guards, no swept tests, no contact manifolds. It was already outdated at that date. This review replaces it.

## Candidate open directions

1. **2D capsule in the support registry.** Whether to add `supportCollisionCapsule2D` (and register it in `registerBuiltInCollisionSupports2D`) so that `testCollision2D` works with capsules, or to add capsule pair tests to `registerBuiltInCollisionPairTests2D`, or both. The 3D side has both paths; the 2D side has neither. This is the most immediate question.
2. **2D distance/closest-point query.** Whether a `writeCollisionDistance2D` (GJK distance for 2D) belongs in this package, and whether it should use the support-function registry like the 3D version.
3. **Rounded polygon and concave decomposition** — the two remaining chartered shapes under open direction 1.
