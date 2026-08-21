---
package: '@flighthq/physics3d'
updated: 2026-08-21
by: auditor
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The TypeScript target passes its declared AAA qualification envelope. The native ownership decision is
resolved by the separate public `@flighthq/physics3d-abi` package; Rust/WASM implementation and native
differential evidence remain deliberately paused. The measurable TypeScript gate is in
[review.md](./review.md); performance ceilings and the reference host are in
[performance.md](./performance.md).

Bodies own compound colliders; the step generates persistent contacts and begin/end events through a
pluggable 3D spatial backend and collision narrow phase. Seven convex kinds plus static triangle meshes
and heightfields, point/ray/region/shapecast queries, debug geometry, analytic linear plus bounded
rotational CCD, all seven joint kinds, compliant limits, reactions/breakage, islands/sleeping, contact
hooks, substeps, versioned hydration, lifecycle controls, opt-in guards, exact-repeat determinism,
long-horizon stress scenes, and enforced performance/allocation budgets ship.

- **Collision registration remains opt-in.** An unregistered support produces no contact. This is now
  diagnosable at every layer: `explainPhysics3DCollision`, `explainCollisionTest3D`, collision guards,
  and physics3d guards name the missing registration rather than leaving a falling body unexplained.
- **Static concave terrain is complete.** Triangle meshes and heightfields dispatch outside the convex
  support registry through a retained local BVH, rebuild after explicit payload invalidation, transform
  without rebuilding local acceleration, reduce adjacent triangle contacts, and participate in world
  bounds, raycasts, shapecasts, CCD, debug geometry, and long-horizon distributed-load scenes. Physics3d
  rejects attaching either kind to a movable body.
- **A numerical envelope is checked in.** The 12-box stack must retain a top centre above 11; fixed
  100:1 default and 1,000:1 four-substep stacks retain >99% spacing and sleep; 60-second restitution,
  friction isotropy, joint error, angular convergence, and contact-aware timestep scaling have bounds.
- **CCD has explicit translation, rotation, and lifecycle guarantees.** Translation always retains
  collision's analytic convex sweep, even while a bullet spins. Rotation samples at a one-degree target
  under `maxCcdRotationSubsteps`, bisects its first overlap, and resolves manifold normal/friction impulses
  with angular effective mass. Linear impacts deliberately use centre-of-mass normal/friction impulses
  because one GJK witness cannot represent a face-face region without false torque. Solid TOIs run hooks
  and publish persistent contacts in the impact step; sensors do not resolve or run hooks, retain identity
  until an end transition, and do not fire behind an earlier solid impact. The exported envelope writer
  reports the exact angular and furthest-point arc gap when the hard budget binds.
- **Measured frame, allocation, and spatial-workload ceilings are checked in.** Both uniform-grid and BVH
  backends run a 256-contact stack and 256 sparse awake movers. A 256-body 64:1 mixed-scale scene also
  compares the default grid, a tuned grid, and the BVH; exact mode and candidate-pair gates prove the
  default's 96 overflow bodies and the tuned grid's 3.17x candidate expansion independently of host
  timing. Failing gates also cover CPU p95, sampled transient bytes, and retained heap per step.
- **Deliberate costs and custom-loop contracts stay explicit.** Mutable convex hull faces rebuild on
  demand rather than cache a second source; shapecast stops at the first realized hit; the exported
  contact preparer requires `buildPhysics3DSolveIslands` first so sleeping islands avoid a full scan.
- **Known joint approximations are explicit.** Cone-twist and generic 6-DOF cannot safely swap asymmetric
  frame ends. A 6-DOF combined angular bound projects axis-angle error per frame axis rather than adopting
  an Euler order. Gyroscopic integration is explicit; fast asymmetric spinners should use substeps.
- **Guards cover all silent omissions and broadphase cost fallback.** They report declined steps, missing
  collision support, each unresolved joint, and bodies routed through spatial overflow. The Physics3D
  guard reads only its world's backend rather than taking over spatial's process-wide caller-composed
  guard. Collider geometry/material/filter/derived-kind validation occurs before intake, so a NaN
  material cannot poison a newly generated contact in the same frame.
- **Native ownership no longer changes the standard API.** `physics3d-abi` now owns the persistent handle,
  packed command/readback, synchronous hook, and query boundary as a public executable TypeScript contract.
  A future native target conforms there while a standard object-world shadow remains a separate promise.

## Log

- **2026-08-21** — Native API shape resolved into `@flighthq/physics3d-abi`; the standard object-world API
  remains independent and adds no bundle edge for ordinary TypeScript consumers.
- **2026-08-21** — TypeScript AAA gates completed: accelerated static mesh/heightfield terrain, enforced
  grid/BVH performance and allocation budgets, and CCD friction/hooks/persistent events/angular envelope;
  only the paused native-target qualification remains.
- **2026-08-21** — Numerical, determinism, long-horizon, lifecycle, diagnostic, substep, and retained-workspace
  qualification completed; solver defects exposed by the scenes were fixed in place.
- **2026-08-21** — Shape/query breadth, convex mass properties, linear/rotational CCD, joint reactions,
  breakage, compliant limits, and distance-joint rigid/spring/rope modes completed.
- **2026-08-20** — Plain-data world, compound contact pipeline, seven joint solvers, islands/sleeping,
  explicit step composition, validation/explanation, substeps, and lifecycle controls established.
