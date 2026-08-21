---
package: '@flighthq/collision'
updated: 2026-08-21
by: principal
---

# collision — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **3D now carries seven kinds, six closed-form pairs, and the same diagnostics as 2D.** Sphere, aabb,
  box, capsule, cylinder, cone, and convex all register support functions;
  `registerBuiltInCollisionPairTests3D` adds closed-form sphere-sphere, sphere-aabb, sphere-box,
  sphere-capsule, capsule-capsule, and aabb-aabb over the GJK/EPA floor. Box-box is deliberately left
  on the floor: a box boundary is FLAT, so EPA's normal on it is already exact and only speed would
  argue for a hand-written fifteen-axis SAT.
- **The 2D core is proven under the 3D work.** `testCollision2D` dispatches through the pair registry
  then the support floor, the ten SAT pairs register via `registerBuiltInCollisionPairTests2D`, and the
  generic core agrees with all ten incumbents EXACTLY over 4000 seeded pairs — same overlap decision,
  same depth to 1e-5, same normal to the measured 4e-3 EPA ceiling, same sign, no exemptions.

- **Registration is now a precondition of the generic dispatcher, and nothing registers at module
  load.** A caller that opens neither door gets `false` from every pair. That is deliberate — it is
  what makes the ten SAT pairs tree-shakable — and `explainCollisionTest2D` reports
  `'unsupported-shape-kind'` rather than `'separated'` for a valid shape whose kind has no binding, so
  the mistake is diagnosable. The direct typed pair functions need no registration at all.

- **EPA's normal on a CURVED boundary has a far worse TAIL than "a few parts in a thousand".** The
  typical case is excellent and the worst case is not, and only the worst case matters for a contact
  normal. Measured over a seeded 3D sphere-sphere sweep against the exact centre line: median dot
  0.9999999999, p5 0.99998, **worst 0.9656 — a fifteen degree error**. Depth stays good (median 6e-10,
  p95 1.7e-5, tail 2.6e-3) while the closed form's own depth error never exceeds 4.4e-16. Inherent:
  EPA terminates on a DISTANCE, and distance is second-order insensitive to angular error, so a nearly
  converged depth can sit on a facet pointing measurably the wrong way. That tail, not the median, is
  what a closed-form pair buys, and it is why the five curved 3D pairs earn their place on conditioning
  as well as speed. `shapeCollision3D.test.ts` carries the numbers and the tolerances derived from them.
- **The typed 2D pair functions do not carry a dimension, and the collision has now arrived.**
  `testCircleCircleCollision` and the other nine keep their bare names, plus five `testSegment*`
  functions and ten `collide*ContactManifold` functions — 25 unsuffixed exports. This was parked
  "until 3D shapes land"; they have landed, and `testAabbAabbCollision` now sits beside
  `testAabbAabbCollision3D`. The 3D set was suffixed rather than renaming 25 public names and two
  examples unilaterally, so the asymmetry is deliberate and open: a decision for the user, not a gap.
- **More shapes.** 2D capsule, rounded polygon, and a general concave-as-convex-decomposition path.
  A capsule now costs one support function rather than a column of the pair matrix.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — Cylinder and cone landed across every 3D seam, and the raycasts were verified by an
  instrument that shares no code with them: a brute-force scan of the containment predicate along each
  seeded ray. It caught a real defect no unit test had — the cylinder CAP normal was inverted, because
  the sign was derived from the ray direction and flipped on the near/far swap rather than read off
  which plane the near parameter belonged to. The fraction was correct throughout, so a ray stopped in
  exactly the right place while reporting a surface facing into the solid. The cone's inertia tensor is
  likewise checked against a grid integration, since the textbook transverse moment is quoted about the
  APEX and using it about the centroid inflates a tall cone by a factor of sixteen.

- **2026-08-21** — `explainCollisionTest3D` now exists. Two source comments had cited it for some time
  as the seam that classifies `testCollision3D`'s silent false, and it had never been written;
  `getCollisionShapeValidationStatus3D` was likewise absent, and `enableCollisionGuards` wired only the
  2D dispatcher, so a 3D world whose supports were never registered warned nobody while its bodies fell
  through its floors. All three landed together. There is deliberately no `'non-convex-polygon'` status
  in 3D: a hull is reached only through a support scan that cannot return an interior vertex, so a
  concave point set is not wrong, it simply IS its own convex hull.

- **2026-08-21** — The differential test found a real defect in the incumbent, and it is fixed. The SAT
  paths oriented their manifold normal by comparing shape CENTROIDS, which is only a heuristic: it
  picks the wrong side whenever one shape's projection nests inside the other's asymmetrically, because
  the centroid can sit on the far side from the shallower exit. Both `polygonAxisOverlap` and
  `circlePolygonAxisOverlap` already computed the two push distances and returned the smaller — the
  winning SIDE was computed and thrown away. They now report it, and the callers use it instead of the
  centroid. Verified independently of both implementations: translating A by `normal * depth` separates
  the pair for the corrected normal and leaves it overlapping for the old one. `testAabbAabbCollision`
  was never affected — it already used the side-based rule inline. Generic and incumbent now agree with
  no tolerated exemptions at all; the 50 hardened SAT tests are unchanged and still pass.

- **2026-08-21** — EPA tie-break: axis canonicalized into a half-plane and lexicographically
  tie-broken, mirroring `canonicalizeScratchAxis` and `isPreferredAxis`, with the centroid rule applied
  ONLY when the Minkowski difference is as deep both ways. The centroid rule applied unconditionally
  was tried first and is wrong — it flips the sign in the many cases where EPA's outward normal is
  already geometrically correct, taking the disagreements from 4 to 47. Sign disagreements now stand at
  two, pinned exactly.

- **2026-08-20** — The dimension boundary landed, and the support-function core behind it. Every type
  and every generic entry point now carries `2D` (`CollisionShape2D`, `CollisionManifold2D`,
  `testCollision2D`, `collideContactManifold2D`, ...), which is what a 3D half can be added beside
  rather than by widening. Then `collisionSupport2D.ts` (two registries: support by kind, pair
  specialization by ordered kind pair) and `gjk2D.ts` (GJK for overlap, EPA for penetration). Three
  bugs the tests caught, each worth the test that found it: GJK treated the origin lying ON a
  1-simplex as separation, which reports two overlapping circles whose centres share an axis as
  disjoint; the triangle case oriented its edge perpendiculars by the signed area, which is correct
  for one winding and inverted for the other; and the differential test's own polygon generator
  overshot 2*pi and produced self-intersecting polygons the incumbent is documented not to answer for
  — a generator bug that looked exactly like a solver bug. Also closed the guard's missing
  `'unsupported-shape-kind'` arm: with guards enabled, an unrecognized kind used to return a silent
  false and log nothing, which is the worst sentinel available.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. **All five previously-open items checked
  out false and were deleted.** (1) "No guard layer yet" — `enableCollisionGuards.ts:19` installs a
  `logOnce` warning through the `setCollisionTestGuard` seam, with `explainCollisionTest.ts:9` as the
  plain-data query. (2) "Degenerate shapes documented-but-untuned, best-effort paths" —
  `collisionShapeValidation.ts` classifies them and every pair test rejects them up front
  (`shapeCollision.ts:36`, `:597-616`). (3) "Segment edge cases use magnitude-absolute epsilons" —
  `segmentCollision.ts:229` and `pointContainment.ts` scale by shape extent. (4) "Deep-containment
  MTV direction is not deterministic when centroids coincide" — `canonicalizeScratchAxis`
  (`shapeCollision.ts:554`) plus the lexicographic tie-break in `isPreferredAxis` (`:582`) fix it,
  pinned by tests at `shapeCollision.test.ts:87`, `:203`, `:294`, `:380`. (5) "Phase 2 and phase 3
  pending" — `sweepCollisionShape.ts`, `shapeContact.ts`, `collideContactManifold.ts`, and
  `contactFeatureId.ts` all exist; only capsule/rounded shapes are left, kept above.
- **2026-07-29** — Contact manifolds landed as a parallel lane (`CollisionContactManifold` +
  `collide*ContactManifold`), with feature ids packed by positional multiplication in the private
  `contactFeatureId.ts` and argument-order invariance holding only across kinds.
- **2026-07-10** — Phase 1 built: the ten manifold pair tests over a shared SAT core, the kind-ranked
  `testCollision` dispatcher, point containment, and the five boolean segment queries. Frozen
  conventions: the normal pushes **A out of B**; touching is exclusive for manifold tests and
  inclusive for containment/segment queries; SAT uses min-of-both-directions separation, not
  intersection length.
