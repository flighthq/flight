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

## Open directions

1. **Determinism guarantees.** Cross-platform float determinism is hard. Decide whether to promise bitwise reproducibility (requires careful FP ordering) or just logical determinism (same inputs → same outputs within epsilon).
2. **Body/joint entity model.** Use the `@flighthq/entity` runtime pattern, or lighter plain objects with numeric IDs? Box2D uses opaque handles; Flight's style leans toward plain entities.
3. **Integration with `@flighthq/collision` shape model.** Bodies reference colliders; decide whether to wrap collision shapes or reference them directly.
4. **Debug visualization.** A `drawPhysics2DDebug` helper that renders shapes/contacts/joints through the display pipeline, or a standalone canvas overlay?
