---
package: '@flighthq/physics3d'
crate: flighthq-physics3d
draft: false
lastDirection: 2026-07-15
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# physics3d — Charter

## What it is

3D rigid-body dynamics: a constraint solver over 3D collision shapes (sphere, box, capsule, convex hull, triangle mesh), producing contact resolution, friction, restitution, joints, and sleeping in three dimensions. The 3D physics engine — Bullet/Rapier/PhysX territory — as a plain-data simulation with explicit step.

This is the 3D half of physics. 2D rigid-body dynamics is `@flighthq/physics2d`. The split exists because the dimension changes the mathematical model: GJK/EPA contact generation (vs 2D SAT), 3×3 inertia tensors (vs scalar), quaternion angular velocity integration, 3D constraint Jacobians, and fundamentally different broadphase structures (BVH/octree vs uniform grid). The two share vocabulary but not implementation.

## North star

- **Explicit-step solver.** `stepPhysics3D(world, dt)` advances the simulation; nothing runs implicitly.
- **Plain-data bodies and joints.** `RigidBody3D` is a plain entity with position (Vector3), orientation (Quaternion), linear/angular velocity, mass, inertia tensor, shape reference.
- **GJK/EPA narrow-phase.** Contact generation uses the standard GJK (Gilbert-Johnson-Keerthi) distance algorithm + EPA (Expanding Polytope Algorithm) for penetration depth — the 3D equivalent of 2D SAT. This is new code, not in `@flighthq/collision` (which is 2D).
- **No scene-graph dependency.** Operates on bodies; a sync layer copies transforms onto scene nodes.
- **Rust-intended.** The solver is a prime candidate for Rust/WASM acceleration. The TS implementation is the spec; the Rust crate is the performance target.

## Boundaries

**In scope:**

- 3D rigid-body simulation: symplectic Euler or semi-implicit integration, quaternion angular integration.
- GJK/EPA narrow-phase for 3D shapes.
- 3D broadphase (BVH or sweep-and-prune).
- Contact constraint solver: sequential impulses, warm starting, friction (Coulomb cone approximation), restitution.
- Joint types: ball-and-socket, hinge, slider, fixed, cone-twist, generic 6-DOF.
- Island building and sleeping.
- CCD for fast-moving 3D bodies (speculative contacts or swept-shape TOI).
- Body types: dynamic, static, kinematic.
- 3D collision shapes: sphere, box, capsule, convex hull, triangle mesh (static only), heightfield.

**Non-goals:**

- 2D physics — `@flighthq/physics2d`.
- Soft-body, cloth, fluid, destruction — distinct domains.
- Scene-graph integration — headless sim.
- GPU physics (compute-shader solver) — future `compute-wgpu` territory.

**Dependencies:** `geometry` (Vector3, Quaternion, Matrix4, Aabb), `math`, `types`.

## Decisions

- **[2026-07-15] Separate package from 2D.** Different mathematical model across the board. User-directed.
- **[2026-07-15] Reserve status: build after `physics2d` proves the seam.** The 2D solver lands first and establishes the API patterns (step model, body/joint entity shape, event callbacks). 3D follows the same patterns with 3D math.
- **[2026-07-15] Rust-intended.** Primary performance target is the Rust crate; TS is the spec.

## Open directions

1. **Solver architecture.** Sequential impulses (Box2D/Bullet heritage) vs XPBD (position-based, Rapier/Jolt style). XPBD is newer and handles stiff constraints better; SI is more proven. Design call.
2. **3D narrow-phase home.** GJK/EPA could live in `@flighthq/collision` (which would then span 2D+3D, matching the unification decision) or in this package. If collision stays unified, GJK/EPA belongs there.
3. **Broadphase home.** 3D broadphase (BVH, octree) could live in `@flighthq/spatial` (matching the unification decision) or here. Consistent with the spatial unification ruling, it should go in `spatial`.
4. **Inertia tensor computation.** From mesh geometry (convex hull, triangle mesh) — does this live here or in `@flighthq/mesh`?
