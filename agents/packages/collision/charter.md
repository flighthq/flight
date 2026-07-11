---
package: '@flighthq/collision'
crate: flighthq-collision
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# collision — Charter

## What it is

`@flighthq/collision` is the **2D narrow-phase collision cell** — shape-vs-shape overlap tests between game-space colliders, returning a **contact manifold** (are they overlapping, and if so the minimum-translation normal + penetration depth), not just a boolean. It is the detection layer a 2D game, physics step, or trigger system queries after a broadphase (`@flighthq/spatial`) has narrowed the candidate pairs.

It is distinct from its neighbors: `@flighthq/geometry` owns 3D bounding-volume math (its `Aabb`/`Obb`/sphere are 3D); `@flighthq/interaction` owns pointer hit-testing against display objects; `collision` owns general 2D collider-vs-collider tests decoupled from the scene graph, on plain-data shapes.

## North star

The complete 2D collision-detection toolkit: every canonical collider pair (circle, axis-aligned box, oriented box, convex polygon, segment, point) resolved to a manifold, plus point/ray/segment queries against each — the Box2D/SAT narrow-phase feature set, as small side-effect-free functions writing to `out` manifolds, no allocation in the hot path. Swept (continuous / time-of-impact) tests for fast movers are the chartered phase-2 extension over the same shapes.

## Boundaries

- **Depends on `@flighthq/geometry` (Vector2 + Rectangle math) + `@flighthq/types`.** No scene graph, no display, no renderer.
- **Detection, not resolution.** It reports the manifold (overlap + normal + depth); it does not integrate velocities, resolve penetration, or own a physics world — that is a physics layer composing over it. Contact-point sets beyond the MTV are a later refinement.
- **Narrow-phase only.** Broadphase (which pairs to even test, over many objects) is `@flighthq/spatial`. Collision tests a *given* pair.
- **Plain-data colliders.** A collider is a plain shape value (kind + parameters), not a display object; games map their entities onto colliders.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Phased AAA build; phase 1 = discrete overlap + manifolds.** P1: discrete shape-vs-shape tests returning a `CollisionManifold` (overlap boolean + minimum-translation normal as flat `normalX`/`normalY` + `depth` — flat fields, not a nested `Vector2`, to keep the `out`-manifold allocation-free) for the 2D shape set {circle, AABB, oriented box, convex polygon, segment, point}, plus point/segment queries. P2: swept / time-of-impact for moving shapes (tunneling). P3: contact-point manifolds + additional shapes (rounded/capsule 2D). User-directed 2026-07-10 (discrete + grid first).
- **[2026-07-10] Manifold-returning, `out`-parameter, allocation-free.** Tests write into an `out` `CollisionManifold` and return a boolean overlap, so a hot loop over thousands of pairs allocates nothing. A general convex separating-axis (SAT) core handles AABB/OBB/convex-polygon uniformly; circle and point/segment are special-cased. Implementation structure (SAT core + specials, or a per-pair registry) is the builder's call, but the manifold contract and shape set are fixed.
- **[2026-07-10] Shapes + `CollisionManifold` in `@flighthq/types`.** `CollisionShapeKind` (string kinds), the shape types, and the manifold live in the header layer, so a physics/broadphase neighbor references them without importing this package.

## Open directions

1. **Swept / time-of-impact (phase 2).** Continuous tests for moving colliders — the chartered follow-on for fast movers.
2. **Contact manifolds (phase 3).** Full contact-point sets (not just the MTV) for stable physics resolution.
3. **More shapes.** 2D capsule, rounded polygon, and a general concave-as-convex-decomposition path.
