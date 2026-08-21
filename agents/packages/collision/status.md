---
package: '@flighthq/collision'
updated: 2026-08-08
by: principal
---

# collision — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **The generic GJK/EPA core is built and not yet wired in as the fallback.** `testCollisionSupport2D`
  agrees with all ten incumbent SAT pairs EXACTLY over 4000 seeded pairs — same overlap decision, same
  depth to 1e-5, same normal to the measured 4e-3 EPA ceiling, same sign, no exemptions. What remains
  before `testCollision2D` can dispatch through the registries is assembly rather than correctness:
  registering the ten pairs as specializations, which also closes the open kind / closed union defect.

- **EPA's normal on a CURVED boundary is accurate to about the square root of its tolerance** — a few
  parts in a thousand on a deep circle overlap, against a depth good to 1e-10. Inherent: EPA
  terminates on a distance, and distance is second-order insensitive to angular error. It is one of
  the two reasons a pair specialization earns its place, the other being speed.
- **The open kind / closed shape union mismatch.** `CollisionShapeKind2D` admits any string but
  `CollisionShape2D` is a closed tagged union, so a vendor kind needs a double cast — the collision
  charter's open direction 2. Now half-closed in practice: the support registry accepts a vendor kind
  and GJK will test it. The type still refuses to express one.
- **The typed pair functions do not carry a dimension.** `testCircleCircleCollision` and the other
  nine keep their bare names while the types and the generic entry points are suffixed. Sphere and
  circle differ by word, but `testAabbAabbCollision` will collide with its 3D twin. Deliberately left
  until 3D shapes land rather than renamed against a set that does not exist.
- **More shapes.** 2D capsule, rounded polygon, and a general concave-as-convex-decomposition path.
  A capsule now costs one support function rather than a column of the pair matrix.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

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
