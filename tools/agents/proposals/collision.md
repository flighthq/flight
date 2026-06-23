---
id: collision
title: '@flighthq/collision'
type: new-package
target: collision
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/collision.md
  - tools/agents/docs/reviews/breadth/game-2d.md
  - tools/agents/docs/reviews/breadth/missing-domains.md
depends_on: []
updated: 2026-06-23
---

## Summary

Value-typed 2D collision — AABB/circle/polygon overlap and swept tests, penetration/separation vectors (contact manifolds), a tile-collision resolver, and a minimal body integrator (velocity, gravity, restitution). Data and free functions, no runtime objects.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely useful version: the AABB/circle narrowphase + a tile-vs-body resolver + a single-body integrator — the exact platformer core loop the reviews say has no home today.

- **Types in `@flighthq/types`:**
  - `Circle` / `CircleLike` — `{ x: number; y: number; radius: number }` (the missing 2D primitive; `Aabb` and `Rectangle` already live in `geometry`/`types`).
  - `CollisionManifold` — the contact result: `{ hit: boolean; normalX: number; normalY: number; depth: number; contactX: number; contactY: number }` (separation normal + penetration depth + contact point). Written to an `out` param.
  - `SweptResult` — `{ hit: boolean; time: number; normalX: number; normalY: number; contactX: number; contactY: number }` (`time` is the fraction `0..1` of the motion at first contact; `1` / `hit:false` means no contact this step).
  - `Body2D` — minimal integrator state: `{ x: number; y: number; velocityX: number; velocityY: number; restitution: number; friction: number; mass: number; isStatic: boolean }`.
  - `Body2DStepOptions` — `{ gravityX?: number; gravityY?: number; maxSpeed?: number }`.
- **Circle constructors (`collision`):** `createCircle(x, y, radius)`, `copyCircle(out, source)`, `cloneCircle(source)`, `setCircle(out, x, y, radius)`, plus `acquireCircle` / `releaseCircle` / `clearCirclePool` mirroring `geometry`'s pool discipline.
- **Boolean overlap tests (the cheap "do they touch" tier):**
  - `intersectsAabbAabb(a, b)` — (thin wrapper over geometry's rect test, named in the collision vocabulary) returns boolean.
  - `intersectsCircleCircle(a, b)`, `intersectsAabbCircle(aabb, circle)`, `intersectsAabbPoint`, `intersectsCirclePoint`.
- **Manifold tests (the "where and how deep" tier):**
  - `resolveAabbAabb(out: CollisionManifold, a, b)` — minimum-translation-vector separation for two AABBs.
  - `resolveCircleCircle(out, a, b)`, `resolveAabbCircle(out, aabb, circle)`.
  - All alias-safe and allocation-free; `out` is a caller-owned `CollisionManifold`.
- **Closest-point helpers:** `getClosestPointOnAabb(out: Vector2Like, aabb, point)`, `getClosestPointOnSegment(out, ax, ay, bx, by, px, py)` — the shared kernels the circle tests and tile resolver build on.
- **Tile-collision resolver (the headline platformer feature):**
  - `TileCollisionGrid` type in `@flighthq/types` — `{ tileWidth; tileHeight; columns; rows; solid: Readonly<Uint8Array> }` (a solidity mask, decoupled from `sprite`'s `Tilemap` so collision never imports `sprite`).
  - `isTileSolid(grid, column, row)`, `getTileColumnAtX(grid, x)`, `getTileRowAtY(grid, y)`.
  - `resolveBodyAgainstTileGrid(grid, body, deltaX, deltaY, out: TileCollisionResult)` — moves a body's AABB by `(deltaX, deltaY)` against the solid mask, axis-separated (X then Y) so it slides along walls and lands cleanly on floors; writes the resolved position and per-axis contact flags.
  - `TileCollisionResult` type — `{ x; y; hitLeft; hitRight; hitTop; hitBottom }` (the `onGround = hitBottom` signal a controller needs).
- **Body integrator:**
  - `createBody2D(x, y, options?)`.
  - `stepBody2D(body, deltaTime, options?: Body2DStepOptions)` — applies gravity, clamps to `maxSpeed`, advances position by velocity. Pure single body; collision response is the caller's loop (test → `resolveBodyAgainstTileGrid` → re-read velocity).
  - `applyBodyImpulse2D(body, impulseX, impulseY)`, `setBodyVelocity2D(body, vx, vy)`.
- **Tests:** colocated `*.test.ts` per source file — overlap truth tables, manifold depth/normal correctness, alias-safe `out`, tile slide-along-wall and land-on-floor, `deltaTime = 0` no-op, integrator gravity accumulation.

Effort: small-to-medium. The AABB/circle narrowphase + tile resolver + single-body step is the 20% that delivers the platformer 80%.

### Silver

Competitive and solid — matches what a well-regarded 2D collision library (SAT.js, Collide2D, the collision half of Arcade/Matter) offers: convex polygons, swept/continuous tests, a per-pair resolution helper, and ray casts.

- **Types in `@flighthq/types`:**
  - `Polygon` / `PolygonLike` — convex polygon as `{ x: number; y: number; vertices: Readonly<Float32Array>; vertexCount: number }` (vertices relative to origin; world-space via `x`/`y`), plus an optional cached `normals` slot.
  - `CollisionShape` — a tagged union over `CollisionShapeKind` so heterogeneous shapes go through one dispatch: `'Aabb' | 'Circle' | 'Polygon'` (string `*Kind` identifiers, the SDK kind model; vendor-prefixed for custom shapes).
  - `Ray2D` — `{ originX; originY; directionX; directionY }`; `RaycastResult` — `{ hit; time; pointX; pointY; normalX; normalY }`.
  - `CollisionLayerMask` — `{ category: number; mask: number }` bitmask filter pair (the "what collides with what" layer convention every engine ships).
- **Convex polygon narrowphase (SAT):**
  - `intersectsPolygonPolygon(a, b)`, `intersectsAabbPolygon`, `intersectsCirclePolygon`, `intersectsPolygonPoint`.
  - `resolvePolygonPolygon(out, a, b)`, `resolveAabbPolygon(out, aabb, poly)`, `resolveCirclePolygon(out, circle, poly)` — SAT minimum-translation-vector with contact point.
  - `getPolygonProjection(out, poly, axisX, axisY)` and `getPolygonNormals(out, poly)` — the SAT building blocks, exported for users writing custom shapes.
  - `setPolygonFromRectangle`, `setPolygonFromVertices`, `createRegularPolygon(sides, radius)`, `transformPolygonByMatrix` (reusing `geometry`'s `Matrix`) for rotated colliders.
- **Generic shape dispatch:** `intersectsShapeShape(a: CollisionShape, b: CollisionShape)` and `resolveShapeShape(out, a, b)` — one entry point that dispatches on `CollisionShapeKind`, so callers with mixed colliders need one call.
- **Swept / continuous tests (anti-tunneling):**
  - `sweepAabbAabb(out: SweptResult, moving, deltaX, deltaY, static)` — swept AABB (slab method), the tunnel-proof replacement for discrete tile tests on fast bodies.
  - `sweepCircleCircle`, `sweepCircleAabb`, `sweepAabbPolygon`.
  - `resolveBodyAgainstTileGridSwept(grid, body, deltaX, deltaY, out)` — swept variant of the Bronze tile resolver for fast-moving bodies.
- **Ray casts (line-of-sight, hitscan, mouse-picking-in-world):**
  - `raycastAabb(out, ray, aabb, maxDistance)`, `raycastCircle`, `raycastPolygon`, `raycastShape`.
  - `raycastTileGrid(out: RaycastResult, grid, ray, maxDistance)` — DDA grid traversal for tile line-of-sight.
- **Per-pair resolution helper:** `resolveBodyCollision2D(a: Body2D, b: Body2D, manifold)` — positional correction + restitution/friction impulse exchange between two dynamic (or one static) bodies, so callers get bounce/slide without writing the impulse math. This is the seam toward a future full solver, kept to the single-pair case here.
- **Layer filtering:** `shouldLayersCollide(a: CollisionLayerMask, b: CollisionLayerMask)` — the boolean every broadphase/narrowphase loop gates on.
- **Bounds helpers:** `getShapeBounds(out: Aabb, shape)` and `getBody2DBounds(out, body, shape)` — the AABB a future `spatial` broadphase and `camera2d` culling index against.

Effort: medium. Polygon SAT, swept tests, and ray casts are each self-contained; the per-pair resolution helper is the one design-sensitive piece (correction strategy, slop, restitution threshold).

### Gold

Authoritative / AAA — the canonical 2D collision narrowphase + resolution reference: exhaustive shape coverage, robust degenerate handling, batch/throughput paths, signals, and 1:1 Rust parity. (A full constraint solver remains a deliberate neighbor; Gold here is the complete collision-and-single-step layer.)

- **Exhaustive shape coverage:**
  - `Capsule` / `CapsuleLike` (the platformer-controller-grade swept-segment shape) with full `intersects*` / `resolve*` / `sweep*` / `raycast*` rows, added to `CollisionShape` and `CollisionShapeKind`.
  - `Segment2D` (line segment as a first-class collider for one-way platforms / edge geometry) and `OrientedBox` (rotated AABB) shape rows.
  - `EdgeChain` (a polyline of solid edges) for tilemap-derived static world geometry, with `raycastEdgeChain` and `resolveCircleEdgeChain`.
  - One-way / pass-through platforms: `TileCollisionFlags` (`solid | oneWayUp | slope`) extending the Bronze solid mask, with slope tiles resolved in `resolveBodyAgainstTileGrid`.
- **Numerical robustness:** documented, sentinel-returning behavior for degenerate inputs (zero-radius circle, collinear/zero-area polygon, zero-length ray, zero `deltaTime`) — return `hit: false` / `-1` rather than throwing; throw only on genuine misuse (non-convex polygon passed to a SAT function, a programmer error). A configurable `CollisionTolerance` (slop, linear/angular thresholds) type in `@flighthq/types`.
- **Throughput / explicit allocation:**
  - `acquire*` / `release*` for `CollisionManifold`, `Body2D`, `Polygon` (and `clear*Pool`), honoring the bracket rule.
  - Batch narrowphase over flat runs: `intersectManyAabb(boundsRun, count, queryAabb, outIndices)` and `stepBodies2D(bodies, count, deltaTime, options)` for particle-grade body counts with zero per-body allocation — the bridge to how `particles` already integrates many objects.
  - A `CollisionWorld2D` value-struct (plain data, not a runtime object): a contact-accumulation scratch (`contacts`, `contactCount`) that `narrowphaseCollisionWorld2D(world, bodies, shapes, count)` fills, so a game runs one call per frame instead of N² hand-written pairs — still free-function-driven, caller owns the world.
- **Signals (opt-in):** `enableCollisionSignals(world)` / `disableCollisionSignals(world)` (the `enable*` group pattern, owner-package-defined) exposing `onCollisionEnter` / `onCollisionStay` / `onCollisionExit` over `@flighthq/signals` with a `CollisionEvent` payload — multi-listener gameplay triggers (pickups, damage zones) without the integrator depending on signals when unused.
- **Tunnel-proof integration step:** `stepBodyAgainstWorld2D(world, body, shape, deltaTime, options)` — the complete swept move-and-slide-and-resolve loop (substep on fast motion, axis separation, restitution/friction, ground/ceiling/wall flags) as one canonical entry point, with the lower-level pieces still exported.
- **Tests + docs:** SAT correctness against reference cases, swept anti-tunneling regression (fast body through thin wall), slope/one-way behavior, alias-safe `out` for every resolver, pool bracket leak checks, and a documented coordinate-space note (Y-down screen space, packed-int-free pure geometry). Rust `flighthq-collision` mirrors every function and is bit-compared under the conformance suite; the divergence map records any intentional TS↔Rust difference (none expected for pure value math).

Effort: large but cleanly partitionable — capsule/segment/edge rows, the batch/world path, and the signals group are independent workstreams; the swept move-and-slide entry point is the integrative capstone.

## Boundaries

- **Hit-testing stays in `interaction`.** Point-in-object picking wired into the scene graph (UI, click-to-select, pointer dispatch) is `interaction`'s job. `collision` operates on standalone value shapes and never imports `node`/`displayobject`/`sprite`.
- **Shape/vector/rect/AABB math stays in `geometry`.** `Vector2`, `Rectangle`, `Aabb`, distance, and the pools are reused, not re-derived. Only the genuinely-collision primitives new to the SDK (`Circle`, `Polygon`, `Capsule`, manifolds, swept results) originate here. (`Circle` is borderline geometry; spec'd here because its consumers are all collision — revisit if other domains need it.)
- **Broadphase / spatial partitioning is a neighbor (`spatial`).** Quadtree, uniform grid, and spatial hash for "what is near X" are out of scope so the narrowphase tests tree-shake alone. `collision` only provides the per-shape AABB (`getShapeBounds`) that a broadphase indexes.
- **2D camera / culling is a neighbor (`camera2d`).** Visible-bounds culling consumes `getShapeBounds`/`getBody2DBounds` but is not collision.
- **Full rigid-body constraint solving is a neighbor (`physics2d`).** Joints, contact islands, sequential-impulse stacking, sleeping, and continuous solver iteration are deliberately out. `collision` stops at single-body integration plus per-pair (Silver) and per-frame contact-accumulation (Gold) resolution — the seam a solver builds on.
- **Particle-vs-object collision stays in `particles`.** `applyParticleCollisions` / `applyParticleObjectCollisions` already exist there over particle-specific state; `collision` does not absorb them, though both may share the same narrowphase kernels long-term.
- **Tile authoring formats (Tiled/LDtk) are a neighbor (`tilemap-formats`).** `collision` consumes a plain `TileCollisionGrid` solidity mask; building that mask from a `.tmx`/`.tlj`/`.ldtk` file is an importer concern, mirroring the `*-formats` pattern.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **`Circle` ownership: `geometry` or `collision`?** `Aabb` and `Rectangle` already live in `geometry`. `Circle` is arguably general geometry, but its only consumers today are collision tests. Spec'd in `collision` for cohesion; if `camera2d`, `interaction`, or filters want a circle, promote `Circle` (type + constructors) to `geometry` and have `collision` re-export the tests only.
- **Manifold normal convention.** Which body the `normal` points _away from_ (A→B vs B→A) and whether `depth` is always positive must be fixed once and documented; every `resolve*` must agree (the source of most collision-library footguns).
- **Coordinate space.** Confirm Y-down screen space as the canonical convention (matches the renderers) and document gravity defaulting to `+Y`. The math is space-agnostic but defaults and slope/one-way semantics must pick one.
- **Should `Body2D` carry the shape, or stay shape-free?** Bronze keeps `Body2D` shape-free (caller passes the shape alongside) for maximal value-type purity and so one body can swap shapes. Gold's `CollisionWorld2D` pairs bodies with shapes by parallel index — confirm that stays index-paired rather than embedding a shape reference in `Body2D` (which would reintroduce a runtime-object smell).
- **`spatial` split timing.** Gold's `CollisionWorld2D` does an N² narrowphase by default. Decide whether it stays brute-force (correct, simple, fine for small N) and defers broadphase entirely to a future `spatial` package, versus accepting an optional injected broadphase index — without coupling `collision` to a partitioning structure.
- **Relationship to a future `physics2d` solver.** Lock the seam now: `resolveBodyCollision2D` (per-pair) and the contact-accumulation world are the intended hand-off points. Confirm a solver would _consume_ `collision`'s manifolds rather than reimplement the narrowphase, so the boundary holds.

## Agent brief

> Create `@flighthq/collision` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
