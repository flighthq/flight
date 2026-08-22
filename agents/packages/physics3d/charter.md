---
package: '@flighthq/physics3d'
role: package
crate: flighthq-physics3d
draft: false
lastDirection: 2026-08-21
review: ./review.md
assessment: ./assessment.md
status: ./status.md
performance: ./performance.md
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
- **[2026-08-20] Sequential impulses first, with no structural bar to another solver.** The rigid-body solver is sequential impulses. The data model must not encode that choice: solver-specific accumulators (effective masses, velocity bias, impulse caches) live in solver-owned storage rather than on the shared contact type; joint `solve` takes `dt`; `substeps` exists in the config from the first release, defaulting to 1; and the step ships as a composition of separately exported functions rather than a monolith. This is a **partitioning obligation on the data model, not a `SolverBackend` interface** — SI and XPBD differ in loop nesting rather than in the body of a per-constraint method, so a method-level seam would sit where they agree and miss where they differ, while costing a speculative abstraction with one implementation. "General rigid-body/contact/constraint model" means shared body state and shared vocabulary; contacts and joints remain separate solve paths, as they are in `physics2d`. Whether XPBD is ever built is deliberately left open. Relayed from the user. See [physics3d solver abstraction](../../physics3d-solver-abstraction.md).
- **[2026-08-20] 3D narrow phase lives in `@flighthq/collision`; 3D broadphase in `@flighthq/spatial`.** Resolves former open directions 2 and 3. Both packages stay unified across dimensions with `2D`/`3D`-suffixed types and entry points, so this package consumes contacts and candidate pairs rather than generating them. See [collision support registry](../../collision-support-registry.md) and [spatial dimension seams](../../spatial-dimension-seams.md). User-directed.
- **[2026-08-21] Static concave acceleration lives in `@flighthq/collision`.** Triangle meshes and
  heightfields are collision shapes but are not convex-support shapes. They own retained local triangle
  BVHs with explicit payload-version invalidation; transformed bounds, manifold generation, raycasts, and
  sweeps consume that acceleration, while physics3d enforces their static-only body contract.
- **[2026-08-21] Native ownership is a separate public ABI package.** `@flighthq/physics3d` keeps its
  ordinary plain-object world API. `@flighthq/physics3d-abi` owns persistent world handles, packed
  mutation/readback buffers, hooks, and queries as an executable TypeScript contract. A future
  `physics3d-abi-rs` may shadow that package while `physics3d-rs` separately shadows the standard API;
  neither changes the other's promise. User-directed.

## Open directions

1. **Active-ragdoll controller and package home.** Flight has the passive rigid-body and joint foundation,
   but not the higher-level controller that binds a `Skeleton3D` rig to bodies/colliders/joint frames,
   drives those bodies toward an animation pose, hands momentum across animated/active/passive transitions,
   and writes the solved pose back to the skeleton. This is not a small addition to the headless solver:
   cone-twist and generic 6-DOF constraints currently have limits but no multi-axis target-orientation
   motor, and the rig descriptor, update order, blend/recovery semantics, self-collision policy, ownership,
   and qualification scenes all need an explicit contract before implementation.

   The current lean is a separate, tree-shakable **`@flighthq/ragdoll3d` integration package** depending on
   `physics3d` and `skeleton3d`, with adapters/callbacks instead of a hard `scene3d` dependency where
   possible. Do not put skeleton/scene orchestration in `physics3d`, and do not turn `skeleton3d` into a
   modeful physics controller. If the design exposes a generally useful target-orientation or multi-axis
   pose motor, that low-level primitive belongs in `physics3d`; humanoid, horse, and other rig binding
   remains in the integration package. The package name and contract are proposed, not yet blessed.

Native implementation and its differential/performance qualification remain deliberately downstream of
the now-established TypeScript ABI contract.
