---
package: '@flighthq/physics3d'
updated: 2026-08-21
by: auditor
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The package has a production-capable convex rigid-body core and is materially beyond file-level parity
with `physics2d`, but is not yet honest to label AAA-complete. The measurable gate and release blockers
are in [review.md](./review.md).

Bodies own compound colliders; the step generates persistent contacts and begin/end events through a
pluggable 3D spatial backend and collision narrow phase. Seven convex kinds, point/ray/region/shapecast
queries, debug geometry, analytic linear plus bounded rotational CCD, all seven joint kinds, compliant
limits, reactions/breakage, islands/sleeping, contact hooks, substeps, versioned hydration, lifecycle
controls, opt-in guards, exact-repeat determinism, and long-horizon stress scenes ship.

- **Collision registration remains opt-in.** An unregistered support produces no contact. This is now
  diagnosable at every layer: `explainPhysics3DCollision`, `explainCollisionTest3D`, collision guards,
  and physics3d guards name the missing registration rather than leaving a falling body unexplained.
- **Static triangle mesh and heightfield remain unbuilt charter features.** A support function represents
  a convex shape, so concave terrain needs mesh-vs-convex dispatch over an accelerated triangle set; it
  is not one more registry entry. This architectural boundary is still an AAA release blocker.
- **A numerical envelope is checked in.** The 12-box stack must retain a top centre above 11; fixed
  100:1 default and 1,000:1 four-substep stacks retain >99% spacing and sleep; 60-second restitution,
  friction isotropy, joint error, angular convergence, and contact-aware timestep scaling have bounds.
- **CCD has two guarantees.** Translation always retains collision's analytic convex sweep, even while a
  bullet spins. Rotation samples at a one-degree target under `maxCcdRotationSubsteps`, bisects its first
  overlap, and resolves the manifold with angular effective mass. Linear impacts deliberately use a
  centre-of-mass normal impulse because one GJK witness cannot represent a face-face region without false
  torque. Impact-time friction, hooks, persistent event semantics, and the angular budget's guaranteed
  speed/extent envelope remain unqualified.
- **Convex hull faces are rebuilt on demand.** Mass properties, raycast, and debug geometry each pay the
  O(n²) hull construction rather than caching a second face source that may disagree with mutable points.
- **Shapecast returns the first hit.** Unlike a ray, a swept solid stops at first contact; positions beyond
  that hit are not part of its realized path.
- **The exported contact preparer requires solve-island workspace.** This is what lets sleeping islands
  avoid a full contact scan; custom step composers must call `buildPhysics3DSolveIslands` first.
- **Known joint approximations are explicit.** Cone-twist and generic 6-DOF cannot safely swap asymmetric
  frame ends. A 6-DOF combined angular bound projects axis-angle error per frame axis rather than adopting
  an Euler order. Gyroscopic integration is explicit; fast asymmetric spinners should use substeps.
- **Guards cover all silent omissions.** They report declined steps, missing collision support, and each
  unresolved joint. Collider geometry/material/filter/derived-kind validation occurs before intake, so a
  NaN material cannot poison a newly generated contact in the same frame.

## Log

- **2026-08-21** — Numerical qualification fixed iteration-lagged friction, corner-biased curved contacts,
  and stale substep topology; solver constraints and grid/BVH pair records now retain steady-topology
  workspace; 669 physics3d and 1,126 cross-package tests pass.
- **2026-08-21** — AAA hardening: offset-COM integration, joint guards, compound warm-start identity,
  coherent ownership/mutation/removal/cache lifecycle, hydration, rotational CCD, finite body controls,
  at-point impulses, and pre-intake collider validation.
- **2026-08-21** — Compliant limits landed for hinge, slider, cone-twist, and 6-DOF through shared soft-row
  parameters; free-axis NaN propagation found and fixed.
- **2026-08-21** — Cylinder/cone colliders and shapecast completed every convex seam.
- **2026-08-21** — Joint reaction reporting and force/torque breakage landed; infinite default bounds were
  exempted from validation so ordinary joints no longer make a step silently decline.
- **2026-08-21** — GJK witness points and the distance joint landed, including rigid, spring, and rope modes.
- **2026-08-21** — Analytic convex linear CCD landed with swept broadphase and bounded chronological TOI.
- **2026-08-21** — Convex-hull mass properties, raycast, debug wireframe, and general 3D debug geometry landed.
- **2026-08-21** — Stress/determinism qualification found and fixed stale-depth position solving.
- **2026-08-21** — Point, ray, ray-closest, and region world queries landed over the live broadphase.
- **2026-08-21** — Compound collider intake, mass derivation, filtering, sensors, events, and collision diagnosis landed.
- **2026-08-21** — Solve islands began driving contacts; limited-joint warm starts and step guards landed.
- **2026-08-20** — Explicit step, validation/explain seams, substeps, contact records, and lifecycle cleanup landed.
- **2026-08-20** — Seven joint solvers, sleeping islands, tensor-aware integration, and contact solver landed.
- **2026-08-20** — Package and plain-data type contract created under the ratified solver architecture.
