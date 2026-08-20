---
package: '@flighthq/collision'
role: package
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

- **[2026-07-15] Unified 2D+3D package.** When 3D shapes arrive (sphere, box, capsule, convex hull), they join this package rather than a separate `collision3d`. The concept is the same (test two shapes for overlap, produce a manifold); the dimension changes the representation and algorithm (SAT for 2D, GJK/EPA for 3D) but not the domain. Where shape names are vocabulary-distinct (Circle vs Sphere, ConvexPolygon vs ConvexHull), no suffix is needed. Where names are ambiguous (AABB, Box), they get a 2D/3D suffix. Test functions split by dimension: `testCollision2D`, `testCollision3D`. User-directed.

- **[2026-07-29] Phase 3 contact manifolds land as a parallel lane, never by widening `CollisionManifold`.** A `CollisionContactManifold` (the lean manifold's fields plus a fixed two-point array and a `pointCount`) and a `collide*ContactManifold` family sit *alongside* the `test*Collision` family rather than replacing it. Rationale: a rigid-body impulse acts at a point — its angular term is the lever arm crossed with the normal, so an MTV alone can never produce torque and `@flighthq/physics2d` cannot be built on the lean manifold. But a trigger system or overlap query needs none of the reference/incident face selection and segment clipping that resolving points requires, and folding both into one manifold would make every overlap-only bundle link the clipping machinery — the "an assembly never inflates the cost of a primitive" invariant. Separate types and separate entry points keep the cheap path cheap. Contact points carry an opaque, frame-stable `featureId` so a solver can match them against last frame's cached impulses and warm-start. ~~Ids are assigned against the dispatcher's canonical kind order, so argument order cannot perturb them.~~ **That last clause was wrong for same-kind pairs and is corrected by the 2026-07-29 argument-order decision below.** User-directed, as physics2d's P0.

- **[2026-07-29] Argument-order invariance holds across kinds, and cannot hold within a kind.** `collideContactManifold` guarantees order-invariant overlap, normal, and depth for every pair, and order-invariant contact points and feature ids only for pairs of *different* kinds, where the kind rank fixes which shape owns the reference face. Two shapes of the *same* kind tie exactly on separation whenever their contacting faces are parallel — a box resting squarely on a box, the commonest case in a stack — the tie resolves toward the first argument, and reversing the arguments moves the points to the opposite surface and renumbers their ids. This is not a defect to fix in the dispatcher: resolving it needs a tie-break derived from the shapes' coordinates, every such rule is a pure function of values, and a pure function of values flips the instant those values cross — reintroducing at dispatch exactly the frame-to-frame flapping the reference-face bias exists to prevent. Hysteresis needs memory of the previous frame; a stateless narrow phase has none. **The stable order is therefore the caller's to supply, and must come from persistent identity rather than geometry, because only identity survives motion.** Found by review2 against a false claim in the decision above, whose regression test asserted the invariant by calling one argument order twice. User-directed.

- **[2026-07-29] Feature ids pack by positional multiplication, bounded at 2^25 faces per shape.** `<<` truncates to 32 bits, so the original shift-packing wrapped a face index out of its 10-bit field once a polygon passed 1024 vertices and handed two unrelated face pairs one id — a solver would then warm-start a contact with an impulse belonging to elsewhere on the shape, presenting as jitter rather than as a crash. Packing is now positional multiplication with each field's scale exceeding everything below it, the widest id 2^52 - 1 (exactly representable, so no id is ever rounded), and `convexContact` reports a clean miss past the bound rather than emitting ids it cannot keep distinct. The packing lives in a private `contactFeatureId.ts` — outside `contract.ts`, like `convexVertices.ts` — so the invariant is testable as arithmetic rather than hopefully through geometry. Found by review2. User-directed.

- **[2026-08-20] The narrow-phase core is a support-function registry, not a pair matrix.** Shapes register a support function ("furthest point in a direction") and reach every other registered shape through a shared GJK/EPA core; pair specializations register over that floor where they earn it, last-write-wins. Rationale: the pair matrix costs O(N²) authored functions in N shapes — 10 today, 21 for the chartered 3D set — while support functions cost O(N), and the vendor extensibility the open `CollisionShapeKind` already advertises is unreachable without it. The generic core does **not** replace contact clipping: GJK/EPA yields one point and a resting box needs four, so `collide*ContactManifold` keeps its face-clipping path and the 2026-07-29 two-lane decision stands untouched. Because the core is then dimension-independent, the package stays **unified**, superseding nothing in the 2026-07-15 ruling but supplying the reason it holds. The dimension boundary is carried by the shape types and entry points (`testCollision2D` / `testCollision3D`, disjoint shape unions), never by the kind string or a runtime field, because `collision` has no hierarchy to enforce families the way the scene graph does. `generic` means one algorithm design instantiated twice (`gjk2d` / `gjk3d`), not one dimension-erased function, so the port keeps its types. Sequenced 2D-first, where the ten existing SAT pairs are an incumbent to differential-test every GJK result against. User-directed. See [collision support registry](../../collision-support-registry.md).

## Open directions

1. **More shapes.** 2D capsule, rounded polygon, and a general concave-as-convex-decomposition path.
2. **The open kind / closed shape union mismatch.** `CollisionShapeKind` admits any string via `(string & {})`, but `CollisionShape` is a closed tagged union of exactly the six built-ins, so a custom kind cannot be constructed without a cast and the advertised vendor extensibility does not exist. Both halves move together or neither does; the support registry above is what makes fixing it worthwhile.
3. **`enableCollisionGuards` does not warn on `'unsupported-shape-kind'`.** `explainCollisionTest` already classifies that sentinel correctly, but the guard fires only on `'degenerate-shape'` and `'non-convex-polygon'` — so with guards enabled, an unrecognized kind still returns a silent `false` and logs nothing. A missed collision is the worst available sentinel and it is the one case the guard skips. One branch wide.
