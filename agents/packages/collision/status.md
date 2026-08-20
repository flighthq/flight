---
package: '@flighthq/collision'
updated: 2026-08-08
by: principal
---

# collision — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/collision/src/` and `packages/types/src/Collision.ts` on 2026-08-08.
Every item the previous file listed as open had been closed in source; what remains is chartered
scope that is genuinely unbuilt, plus one structural trigger that has not fired yet.

- **No capsule or rounded collider.** `CollisionShapeKind2D`
  (`packages/types/src/Collision.ts:13`) is still the six phase-1 kinds — circle, aabb, obb, polygon,
  segment, point — and nothing in `packages/` implements a capsule. Chartered as phase 3 / Open
  direction 3, alongside a concave-as-convex-decomposition path that also does not exist.
- **No 3D narrow phase.** The 2026-07-15 unification decision names `testCollision2D` /
  `testCollision3D` and a GJK/EPA core; neither symbol exists anywhere in the repo, and the exported
  dispatcher is still the unsuffixed `testCollision2D`. Renaming it is part of that landing, so the
  current name is a pre-3D state, not a settled one.
- **Contact manifolds cover area kinds only.** `collideContactManifold2D` reports `segment`, `point`,
  and unknown kinds as non-overlapping (`collideContactManifold2D.ts:41-42`), because a reference face
  needs area. A physics layer wanting segment contacts has no path here.
- **Both generic dispatchers are closed `switch` ladders** — `testCollision2D.ts:53` and
  `collideContactManifold2D.ts:60`. Correct today for a fixed six-kind family in a hot loop, but the
  family is chartered to grow, and the union→registry trigger in the store rules fires when it does.
- **`testSegment*Collision` still returns a bare boolean** (`segmentCollision.ts`). The richer
  hit-fraction/point/normal path landed separately as `raycastCollisionShape2D`
  (`raycastCollisionShape2D.ts:15`), so the two segment APIs now answer different questions under
  similar names — worth a naming pass before either is public-lane frozen.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. **All five previously-open items checked
  out false and were deleted.** (1) "No guard layer yet" — `enableCollisionGuards.ts:19` installs a
  `logOnce` warning through the `setCollisionTestGuard2D` seam, with `explainCollisionTest2D.ts:9` as the
  plain-data query. (2) "Degenerate shapes documented-but-untuned, best-effort paths" —
  `collisionShapeValidation.ts` classifies them and every pair test rejects them up front
  (`shapeCollision.ts:36`, `:597-616`). (3) "Segment edge cases use magnitude-absolute epsilons" —
  `segmentCollision.ts:229` and `pointContainment.ts` scale by shape extent. (4) "Deep-containment
  MTV direction is not deterministic when centroids coincide" — `canonicalizeScratchAxis`
  (`shapeCollision.ts:554`) plus the lexicographic tie-break in `isPreferredAxis` (`:582`) fix it,
  pinned by tests at `shapeCollision.test.ts:87`, `:203`, `:294`, `:380`. (5) "Phase 2 and phase 3
  pending" — `sweepCollisionShape2D.ts`, `shapeContact.ts`, `collideContactManifold2D.ts`, and
  `contactFeatureId.ts` all exist; only capsule/rounded shapes are left, kept above.
- **2026-07-29** — Contact manifolds landed as a parallel lane (`CollisionContactManifold2D` +
  `collide*ContactManifold`), with feature ids packed by positional multiplication in the private
  `contactFeatureId.ts` and argument-order invariance holding only across kinds.
- **2026-07-10** — Phase 1 built: the ten manifold pair tests over a shared SAT core, the kind-ranked
  `testCollision2D` dispatcher, point containment, and the five boolean segment queries. Frozen
  conventions: the normal pushes **A out of B**; touching is exclusive for manifold tests and
  inclusive for containment/segment queries; SAT uses min-of-both-directions separation, not
  intersection length.
