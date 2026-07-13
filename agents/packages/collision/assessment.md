---
package: '@flighthq/collision'
updated: 2026-07-13
basedOn: ./review.md
---

# collision — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **Degenerate-shape hardening tests** — explicit tests (and fixes where behavior is wrong rather than merely best-effort) for zero-radius circles, `min==max` boxes, `<3`-vertex polygons, and zero-length segments, per the status.md phase-2 candidate list.
2. **Magnitude-relative epsilons** — replace the fixed `1e-9` comparisons in `segmentCollision.ts`/`shapeCollision.ts`/`pointContainment.ts` with magnitude-relative tolerances (the `path-boolean` precedent), so large-coordinate scenes stay robust. Behavior-preserving at ordinary scales.
3. **Deterministic MTV tie-break** — a fixed tie-break rule (e.g. prefer the lower-index axis / +X) when centroids coincide in `satConvexOverlap`/`satCircleConvexOverlap`, so identical inputs always give the same normal. Any min-penetration axis is already valid; this only removes nondeterminism.
4. **`enableCollisionGuards` + `explainCollisionTest`** — guard module warning on non-convex polygons and degenerate shapes; a shakeable `explain*` query for `testCollision`'s silent-`false` sentinel (segment/point/unknown kinds carry no manifold). Pure diagnostics-inversion work.
5. **Aliasing tests for `out` manifolds** — exercise reusing one manifold across hits and misses in sequence (stale-normal regression coverage beyond the current suite).

## Backlog

Parked, with why:

- **Phase 2: swept / time-of-impact** — chartered follow-on; sequencing is the user's call, and it wants the ray/segment result-shape ruling first (see open directions).
- **Phase 3: contact-point manifolds, capsule, rounded polygon** — chartered later phase.
- **Segment/ray hit results (t + point + normal)** — additive but introduces a new result type (`CollisionRayHit`-style) in `@flighthq/types`; the shape should be settled once, jointly with phase-2 TOI vocabulary. Surface to charter Open directions.
- **Distance / closest-point queries (GJK-family)** — possibly in-scope AAA breadth, but the charter is silent on whether it belongs here or in a physics-layer neighbor; needs direction.
- **`testCollision` union → registry** — fork B trigger fires when phase-3 shapes grow the family; premature now (tight closed loop is the charter-sanctioned exception).

## Approved

None.
