---
package: '@flighthq/physics2d'
crate: flighthq-physics2d
draft: false
lastDirection: 2026-07-15
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# physics2d — Charter

## What it is

2D rigid-body dynamics: a deterministic constraint solver over `@flighthq/collision` shapes, producing contact resolution, friction, restitution, joints, and sleeping. The 2D physics engine — Box2D/Planck.js territory — as a plain-data simulation with explicit step, no implicit world object, no hidden allocation per frame.

This is the 2D half of physics. 3D rigid-body dynamics is a separate package (`@flighthq/physics3d`) because the dimension changes the mathematical model: different constraint solvers, different contact generation (GJK/EPA vs SAT), different island/sleeping strategies, different broadphase structures. The two share vocabulary (rigid body, joint, constraint, island) but not implementation. The split follows the same principle that separates `skeleton2d` from `skeleton3d`.

## North star

- **Deterministic, explicit-step solver.** `stepPhysics2D(world, dt)` advances the simulation; nothing runs implicitly. Fixed-timestep accumulation is the caller's responsibility (via `@flighthq/clock` or the app loop).
- **Plain-data bodies and joints.** `RigidBody2D` is a plain entity with position, velocity, mass, inertia, shape reference. Joints are plain descriptors. No class hierarchies.
- **Composes over existing primitives.** Collision detection delegates to `@flighthq/collision` (narrow-phase) and `@flighthq/spatial` (broadphase). This package owns the solver, not the detection.
- **No scene-graph dependency.** The sim operates on bodies, not display objects. A sync layer (user code or a future helper) copies body transforms onto display-object positions. Same separation as `particles` (headless sim) vs `particleemitter` (node wrapper).
- **Sequential-impulse solver.** The standard iterative PGS (projected Gauss-Seidel) constraint solver — the architecture Box2D, Chipmunk, and Planck.js proved. Velocity + position iterations, warm starting, contact caching.

## Boundaries

**In scope:**

- Rigid-body simulation: continuous and discrete integration, velocity/position correction.
- Contact constraint solver: sequential impulses, warm starting, friction, restitution.
- Joint types: revolute, prismatic, distance, weld, wheel, pulley, gear, mouse, rope.
- Island building and sleeping (deactivation of at-rest clusters).
- Collision event callbacks (begin/end contact, pre/post-solve) via signals or direct callbacks.
- Continuous collision detection (CCD / time-of-impact) for fast-moving bodies.
- Body types: dynamic, static, kinematic.

**Non-goals:**

- Collision detection itself — `@flighthq/collision` (narrow-phase) and `@flighthq/spatial` (broadphase).
- 3D physics — `@flighthq/physics3d` (different solver architecture).
- Soft-body, cloth, fluid — distinct domains, distinct packages if ever built.
- Scene-graph integration — the sim is headless; sync is the caller's job.
- Rendering — debug-draw helpers may exist but the sim owns no renderer.

**Dependencies:** `collision` (shapes + manifolds), `spatial` (broadphase), `geometry` (Vector2, Rectangle), `math` (clamping, epsilon), `types`.

## Decisions

- **[2026-07-15] Separate package from 3D.** The dimension changes the mathematical model: 2D SAT vs 3D GJK/EPA contact generation, different constraint Jacobians, different island strategies. Same vocabulary, different implementations. User-directed.
- **[2026-07-15] Prereq: `collision` phases 2-3.** Swept/time-of-impact and full contact-point sets must land in `@flighthq/collision` before CCD can be built here.
- **[2026-07-29] Phasing: contact points first, then solver, joints, islands, CCD.** **P0** — `@flighthq/collision` phase-3 contact manifolds, because a sequential-impulse solver applies each impulse *at a point* and its angular term is the lever arm crossed with the normal; with only an MTV there is no lever arm, contact can never produce torque, and a box would slide down a slope without tipping or rest flat without staying level. Building the solver on the lean manifold is a rewrite disguised as a phase. **P1** — types in `@flighthq/types`, then world/body/collider lifecycle, mass and rotational inertia from collider geometry, semi-implicit Euler integration, broadphase wiring with canonical contact sorting, and the sequential-impulse contact solver (velocity iterations, warm starting off a persistent contact cache, Coulomb friction, restitution with a rest threshold, position correction), plus both determinism harnesses. **P2** — joints, registered by string kind through an open registry (distance, revolute, prismatic, weld, wheel, rope, mouse, pulley, gear), and contact events riding the P1 contact cache. **P3** — islands and sleeping; the P1 solver is written *island-shaped* (solving over an explicit body list plus constraint list rather than implicitly over the whole world), so this is a partition step in front of an unchanged solver, not a rewrite — which is why joints may precede it at no cost. **P4** — CCD / time-of-impact, blocked on `collision` phase 2. User-directed.
- **[2026-07-29] Bodies WRAP collision shapes; they do not reference them.** Collision shapes are world-space by construction — a circle carries its center, an OBB its center and rotation, and a polygon its absolute points with no center or rotation field to move at all — so a body's position and angle cannot live in the shape. A `Physics2DCollider` therefore holds a *local-space* `CollisionShape`, its material (density, friction, restitution), a sensor flag, and a preallocated world-space scratch shape refreshed once per step. Allocation is explicit and happens at collider-create time; the step allocates nothing. Settles this charter's former open direction 3. User-directed.
- **[2026-07-29] The world holds a `SpatialIndex` directly — no separate broadphase seam.** `SpatialIndexBackend` is *already* the swap point (uniform grid now, quadtree and sort-and-sweep chartered), so a `Physics2DBroadphase` layered over it would be a seam over a seam: more surface, no new capability, and it hits the decomposition floor. The world creates a default index and takes an override parameter. User-directed.
- **[2026-07-29] Determinism is bitwise for a fixed engine, and enforced by two harnesses in P1.** ECMAScript specifies `+`, `-`, `*`, `/`, and `Math.sqrt` as exact IEEE-754, so bitwise reproducibility is reachable; `Math.cos`/`Math.sin` are implementation-approximated, and `@flighthq/collision` calls them in `shapeCollision.ts` (OBB vertex materialization, circle-vs-OBB), `segmentCollision.ts`, and `pointContainment.ts`. The promise is therefore: bitwise-deterministic for a given engine and input order, and cross-engine deterministic on any path that touches no OBB collider. Two P1 harnesses hold it — a golden trace (fixed scene, N steps, hashed body states) and an order-independence test (shuffled insertion order, identical trace). The second is load-bearing rather than hygiene: `querySpatialPairs` walks a `Map` of `Set`, so its pair order follows insert and move history, and the solver must canonically sort contacts before solving or determinism breaks silently the first time a body is added mid-simulation. Settles this charter's former open direction 1. User-directed.
- **[2026-07-29] The world orders every contact pair by persistent body index before calling the narrow phase.** `@flighthq/collision` is order-invariant across shape kinds but not within one: two same-kind shapes tie exactly on separation whenever their contacting faces are parallel (a box resting on a box), the tie resolves toward the first argument, and reversing the arguments moves the contact points to the opposite surface and renumbers their feature ids. Collision cannot fix this without a coordinate-derived tie-break, which would flip whenever those coordinates cross — so the stable order has to come from persistent identity, which only this layer has. The rule is therefore: sort each pair `(min(bodyIndex), max(bodyIndex))` before calling, uniformly for all pairs so there is no kind-dependent special case to forget. This is a *second* ordering obligation alongside canonical contact sorting, and it is the one warm starting depends on: sorting the contact list fixes solve order, sorting each pair's two bodies fixes contact identity. Both are load-bearing for determinism; neither substitutes for the other. User-directed, from review2's finding against collision P0.

- **[2026-07-29] The caller obligation collision cannot guard is discharged here, in code, or it is not discharged.** A documented caller obligation is a missing guard (the diagnostics inversion rule); collision genuinely cannot guard pair ordering statelessly, so it lands as three obligations this package owes: **(1)** canonical per-pair body ordering is *enforced at contact creation* — the one place broadphase pairs enter the solver — as code, not as a comment on a convention. **(2)** The order-independence determinism harness covers *both* ordering obligations, not one: a harness that shuffles insertion order but always builds each pair the same way would pass with contact identity broken, because shuffling exercises solve order while leaving per-pair order untouched. It must shuffle both. **(3)** No public entry point takes two bodies and returns a contact, so there is no path by which a caller reaches the narrow phase with an uncanonicalised pair — the obligation is structurally discharged rather than documented. If such an entry point is ever added it canonicalises internally, or it ships with an `explain*`/guard seam; it may not delegate the obligation outward. User-directed.

- **[2026-07-29] Why this package inherits that obligation at all — an accommodation, not an error.** The latent defect behind it survived P0 review because a test titled "keeps the same world-space points when the arguments are reversed" compared only *sorted x*, having been written that way because the y values did not match. The asymmetry was met at test-writing time and coded around. **A duplicate assertion is an error; this was an accommodation — a decision not to see something** — and no reviewer could have caught it from the test name. The standing rule it produced: verify every regression probe by running it against the unfixed code, and treat a probe that passes there as a defect in the probe, not as relief. User-directed.

- **[2026-07-29] Canonical ordering buys DETERMINISM, not insertion-invariance — and the harness must say so.** The order-independence harness was first written to assert that reordering *insertion* leaves the trace unchanged. That is false, and it failed honestly rather than being loosened until it passed: reordering insertion changes the body indices, hence the canonical solve order, hence — legitimately — the result, because a sequential-impulse solver applies each impulse against the velocities the previous ones left. What canonical ordering guarantees is that the same world steps identically every time, not that two differently-built worlds agree. The correct harness holds the bodies and indices fixed and varies only what the broadphase *reports*: one injected backend reverses the pair list (exercising obligation 2, the contact-list sort) and a second swaps the two ids within each pair (exercising obligation 1, the per-pair body order, which reversing the list cannot reach). Each was verified to fail when its own obligation is removed and to pass when the other's is — which is the proof they are independent and both required. User-directed.

- **[2026-07-30] P2 partial: registry complete, five of nine joint kinds solved.** `Distance`, `Revolute`, `Weld`, `Rope`, and `Mouse` ship with solvers. `Physics2DPrismaticJoint` is defined in the header with no solver yet, and `Wheel`, `Pulley`, and `Gear` have neither — **this is unfinished work, not a design choice**, and it is recorded here rather than left for a reader to discover from a dangling type. The registry is the deliverable that makes the rest additive: each remaining kind is a `Physics2DJointSolver` registered under a name, with no change to the world, the step, or the solve loop. Prismatic next (wheel composes over it), then pulley and gear, which couple two constraints rather than two bodies and want the registry's `prepare`/`solve` split more than the others do. User-directed.

- **[2026-07-30] Joints and contacts share one solve list and one iteration loop.** Not two passes. Both constrain the same bodies, so giving either a pass to itself lets it undo what the other just corrected — a hinge under load visibly creeps when the contacts beneath it get to convergence between joint iterations. The consequence for ordering: joints inherit the contact list's obligations rather than getting their own. A joint is canonically ordered by body index at `addPhysics2DJoint`, which is the one place a joint enters the world and the only place it can be enforced, since joints have no broadphase to order them. User-directed.

- **[2026-07-30] A large-but-finite body extent hangs the broadphase, and physics2d guards against being what triggers it.** `@flighthq/spatial`'s uniform grid indexes by walking every cell from min to max, so its work is proportional to extent ÷ cell size: one AABB 1e12 units wide hangs the insert outright, verified standalone with no physics involved. Reachable here by ordinary means — a stiff joint, a large timestep, any divergence — and it converts a diagnosable blow-up into an uncatchable hang that takes the caller with it. The step therefore declines to index a body whose bounds are non-finite or wider than `MAX_INDEXED_EXTENT`; that body stops colliding and the rest of the world keeps simulating. **This is a stopgap in the wrong package**: the bound belongs in the index, and the finding is raised to review as cross-package work rather than fixed here unilaterally. User-directed.

- **[2026-07-29] Debug visualization emits data, never draws.** A debug-geometry query returning plain data, not a `drawPhysics2DDebug` that reaches into the display pipeline — drawing from the sim would pull shape and scene dependencies into a headless package and break the `particles` / `particleemitter` separation this charter names as its model, as well as the diagnostics inversion rule (core exposes seams, never messages). Any actual drawing helper is a neighbor package or example-level code. Settles this charter's former open direction 4. User-directed.

## Open directions

1. **Body/joint entity model.** Use the `@flighthq/entity` runtime pattern, or lighter plain objects with numeric IDs? Box2D uses opaque handles; Flight's style leans toward plain entities.
2. **World raycast.** `queryPhysics2DRay` — the Box2D-parity "what did I shoot" gameplay query. It composes `@flighthq/spatial`'s ray query with a per-shape ray test, but `collision`'s segment tests report a bare boolean, so it needs that package's hit fraction / point / normal extension first (`collision` charter, open direction 2). Sequenced P2/P3.
