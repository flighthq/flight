---
package: '@flighthq/collision'
status: solid
score: 70
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# collision — Review

## Verdict

solid — 70/100. Phase 1 of the charter's phased AAA build (discrete overlap + manifolds over the six-shape set) is complete, correct in its documented conventions, and allocation-free in the hot path; 68 tests back it. The score reflects that the domain deliberately extends two more chartered phases (swept/TOI, contact points) plus the hardening items the build session itself logged in status.md — none of which are started.

## Present capabilities

- **Types** (`packages/types/src/Collision.ts`): `CollisionShapeKind` open string union, six shape interfaces (`CollisionCircle`/`CollisionAabb`/`CollisionObb`/`CollisionPolygon`/`CollisionSegment`/`CollisionPoint`), discriminated `CollisionShape`, and the flat `CollisionManifold {overlapping, normalX, normalY, depth}` — exactly the 2026-07-10 decisions.
- **Manifold bracket** — `createCollisionManifold` / `clearCollisionManifold` (`manifold.ts`); every miss path clears, so a reused `out` never carries a stale normal.
- **Ten pair tests** (`shapeCollision.ts`) — `testAabbAabbCollision` (direct min-penetration), `testCircleCircleCollision` (radial, concentric fallback to +X), `testCircleAabbCollision`/`testCircleObbCollision` (shared `circleAabbOverlap`, local-frame transform + normal rotate-back), `testCirclePolygonCollision` (`satCircleConvexOverlap` with the center-to-nearest-vertex axis), and AABB/OBB/polygon pairs through one `satConvexOverlap` SAT core over `Float64Array` scratch vertex buffers. Normal pushes A out of B; touching is exclusive; penetration is min-of-both-directions separation (containment-correct) — all documented at the definitions.
- **Generic dispatcher** — `testCollision` (`testCollision.ts`): kind-ranked canonical ordering collapses the 4×4 matrix to ten branches, negates the normal on swapped input; segment/point/unknown kinds return `false` with a cleared manifold.
- **Queries** — `getCollisionShapeContainsPoint` (`pointContainment.ts`, boundary-inclusive, per-kind including on-segment/point-coincidence) and five boolean `testSegment*Collision` queries (`segmentCollision.ts`: Liang–Barsky slab clip for boxes, closest-point for circle, local-frame for OBB, endpoint-inside + edge-crossing for polygon, collinear-aware segment-segment).
- **Hygiene** — deps `geometry` + `types` only; zero hot-path allocation (module scratch buffers, inline scalar projections, documented rationale); `sideEffects: false`; 68 tests.

## Gaps

Against a textbook narrow-phase library (Box2D-class), beyond the chartered phases:

- **Swept / time-of-impact** — phase 2, chartered, unstarted.
- **Contact-point manifolds + capsule/rounded shapes** — phase 3, chartered, unstarted.
- **Raycast-style segment results** — the `testSegment*Collision` queries return only a boolean; a mature kit reports entry `t`, hit point, and surface normal. Nothing in the package answers "where did the ray hit."
- **Distance / closest-point queries** — no shape-vs-shape separation distance or closest-point pair (the GJK-family query physics and AI steering lean on).
- **Deterministic MTV tie-break** — status.md logs it: coincident centroids give an arbitrary (valid but non-deterministic) push direction.
- **Degenerate-shape hardening** — zero-radius circles, `min==max` boxes, `<3`-vertex polygons, zero-length segments take best-effort paths without dedicated tests (status.md).
- **Magnitude-relative epsilons** — the fixed `1e-9` epsilons degrade for large-coordinate scenes; `path-boolean` already set the precedent (status.md).
- **No guard layer** — a non-convex polygon or unknown kind silently yields an undefined/false result; per the diagnostics inversion rule this wants `enableCollisionGuards` + an `explain*` query for the `testCollision` sentinel (status.md flags the same).

## Charter contradictions

None. All three 2026-07-10 decisions hold in code (phase-1 scope, `out`-manifold allocation-free contract with SAT core + circle special cases, types in the header layer). Detection-not-resolution and narrow-phase-only boundaries are respected.

## Contract & docs fit

- **Contract**: strong — full type names in functions, `out` params, sentinels not throws, `Readonly<>` inputs, loose scratch at file bottom.
- **Fork B note**: `testCollision` is a closed `switch` dispatcher. It qualifies today as a tight loop in a closed system, but the family is chartered to grow (capsule, rounded polygon in phase 3) — the union-vs-registry trigger will fire then. Unlike the retired `filters` dispatchers, this one has a real consumer role (broadphase → generic confirm).
- **Docs**: the Package Map line matches the built shape, including the phase framing. One adjacency worth flagging: `packages/types/src/CollisionResponse.ts` (+ `CircleCollider`/`RectangleCollider`/`PlaneCollider`) are **particles-domain** collider types sharing the `Collision*` prefix with this package's types in the same header layer — a naming-collision hazard for readers of `@flighthq/types`.

## Candidate open directions

- Result shape for segment/ray hits (t + point + normal): a `CollisionRayHit` out-type, or extend the boolean queries — precedes any phase-2 swept work, since TOI wants the same result vocabulary.
- Registry vs union for `testCollision` when phase-3 shapes land (fork B trigger).
- Whether distance/closest-point queries are in this package's scope or a physics-layer neighbor's.
