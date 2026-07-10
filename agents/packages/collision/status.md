# collision — Status

Continuity log for `@flighthq/collision`. Newest first.

## 2026-07-10 — Phase 1 built (discrete overlap + manifolds)

Package created to the blessed charter. Phase 1 (discrete shape-vs-shape overlap + contact
manifolds) is implemented and green.

**Types** (`packages/types/src/Collision.ts`): `CollisionShapeKind` (open string union), the six shape
interfaces (`CollisionCircle`, `CollisionAabb`, `CollisionObb`, `CollisionPolygon`,
`CollisionSegment`, `CollisionPoint`), the discriminated `CollisionShape` union, and
`CollisionManifold {overlapping, normalX, normalY, depth}`.

**Package** (`packages/collision/src/`):

- `manifold.ts` — `createCollisionManifold`, `clearCollisionManifold`.
- `shapeCollision.ts` — the ten manifold pair tests over a shared private SAT core
  (`satConvexOverlap`) for AABB/OBB/polygon, with circle special-cased (`circleAabbOverlap`,
  `satCircleConvexOverlap`). `testAabbAabbCollision` is a direct min-penetration test.
- `testCollision.ts` — the generic kind-ranked dispatcher.
- `pointContainment.ts` — `getCollisionShapeContainsPoint`.
- `segmentCollision.ts` — the five boolean `testSegment*Collision` queries.

**Conventions chosen (frozen for phase 1):**

- Manifold `normal` pushes shape **A out of B**; on a reversed `testCollision` argument order the
  normal is negated.
- **Touching is exclusive** for the manifold tests: zero penetration → `overlapping:false`. The
  containment (`getCollisionShapeContainsPoint`) and segment queries are boundary-**inclusive**.
- SAT uses the min-of-both-directions **separation** penetration (`min(maxA-minB, maxB-minA)`), not
  the intersection length — correct for containment (a small shape centred in a large one reports
  the exit distance, not its own extent).
- `geometry` is used for `normalizeVector2` (axis normalization, via a module-scratch `Vector2`);
  projections/dots stay inline scalar to keep the hot path allocation-free (boxing every vertex into
  a `Vector2Like` would allocate per call).

**Gates:** see the attestation block from the build session.

## Open items / phase-2 + hardening candidates

- **Deep-containment MTV direction** for convex SAT relies on centroid orientation; when centroids
  coincide (e.g. a circle exactly centred in a polygon) the push direction is arbitrary (any
  min-penetration axis is a valid MTV, but it is not deterministic). Fine for detection; a physics
  resolver wanting stable directions may want a tie-break rule.
- **Degenerate shapes** are documented-but-untuned: zero-radius circles, zero-area (`min==max`)
  boxes, `<3`-vertex polygons, and zero-length segments take best-effort paths. Harden with explicit
  tests in a phase-2 pass.
- **Segment-through-vertex / collinear-segment** edge cases use magnitude-absolute epsilons
  (`1e-9`); a magnitude-relative epsilon (as `path-boolean` adopted) would be more robust for
  large-coordinate scenes.
- **No guard layer yet.** Per the diagnostics inversion rule, caller misuse (non-convex polygon,
  degenerate shape) should surface via an `enableCollisionGuards`/`explain*` module rather than
  silently producing an undefined manifold. Deferred — no inline warnings were added.
- Phase 2 (swept / time-of-impact) and phase 3 (full contact-point sets, capsule/rounded shapes)
  per the charter.
