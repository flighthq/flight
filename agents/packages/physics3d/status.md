---
package: '@flighthq/physics3d'
updated: 2026-08-20
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Feature-complete against the charter except for one thing it cannot do: GENERATE a contact.
Integration, the contact solver, all six joint kinds, islands and sleeping, the composed step with
its substep loop, and both `explain*` seams are built.

- **No contact GENERATION, and none possible.** The 3D narrow phase
  (`agents/collision-support-registry.md`) and broadphase (`agents/spatial-dimension-seams.md`) are
  ratified but unbuilt. `Physics3DWorld` deliberately owns no index field: `SpatialIndexBackend` is
  the swap point and its 3D counterpart is what is missing. A caller builds contacts with
  `createPhysics3DContact` / `createPhysics3DContactPoint`. Do NOT close this by writing a narrow
  phase inside this package.
- **`world.events` is allocated and never written.** Begin/end transitions are read off a persistent
  contact list gaining and losing entries, and the caller owns that list. Fills with contact intake.
- **The solve islands' CONTACT slices are built and unread.** The step drives bodies and joints from
  the island workspace; the contact solve is a flat pass over `world.solver.constraints`. Same
  contacts either way — `preparePhysics3DContactConstraints` skips any pair with no live end — only
  the ORDER differs, and island-major order is a convergence improvement, not a correctness one.
  Closing it means partitioning the constraint list by island.
- **One-sided joint limits are not warm-started.** Limit accumulators live in per-step scratch and
  start each sub-interval from zero; only equality rows and the point/angular blocks carry across in
  `impulse0..5`. Uniform across all six kinds, matching `physics2d`. Revisit if a loaded ragdoll
  visibly sags into its stops.
- **Cone-twist and generic 6-DOF veto `swapEnds`**, so either kind authored with `bodyA > bodyB`
  stays out of canonical order. Exact rather than cautious: a kind may exchange its ends only when
  its own constraint holds the two frames aligned on the axes its parameters are measured against,
  and both deliberately leave that alignment free. `physics2d`'s wheel and mouse joints likewise.
- **A 6-DOF angular bound is the axis-angle error projected onto one frame axis.** Exact for rotation
  about a single axis — the dominant use, and the only one a locked axis reaches — approximate for a
  combined rotation, where a per-axis decomposition would need Euler extraction and an order
  convention with it.
- **`bullet` and `continuousCollision` are carried and unread.** CCD needs a swept 3D narrow phase.
- **Mass properties cover sphere, box, capsule.** Convex hull and triangle mesh are integrals over
  geometry and arrive with the narrow phase that produces those shapes.
- **The gyroscopic term is explicit.** Standard at game timesteps, and why `substeps` is the lever
  for fast spinners. An implicit form is the upgrade if a body turns its own momentum within a step.
- **No guard module.** The diagnostics inversion is half-built: both `explain*` queries exist, the
  `enable*Guards` half emitting through `@flighthq/log` does not. The silent sentinel most worth a
  warning is a joint whose kind has no registered solver.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-20** — `stepPhysics3D` composed, plus `stepValidation.ts`, `explainPhysics3DStep`,
  `explainPhysics3DJoints`, and `contacts.ts` (the constructors a caller needs, since nothing produces
  contacts yet). The step is a composition of named functions per the solver ruling, with the substep
  loop as the OUTER loop: `stepPhysics3DInterval` is one sub-interval and is exported. Ordering trap
  handled — `refreshRigidBody3DWorldInertia` runs at the top of each sub-interval AND again once poses
  have moved, because integrating angular velocity against the previous interval's world tensor is a
  slow plausible precession no single-step assertion catches. `previousTimestep` records the
  SUB-interval, not the whole step, so changing `substeps` rescales the warm-start cache correctly.
  Two lifecycle bugs found and fixed in `removePhysics3DBody`, both surfaced by a test that was trying
  to set up something else: it dropped a body's joints without releasing `physics3DJointOwners` (so
  the joint could never be added to any world again) and without rebuilding the suppression index (so
  the pair stayed suppressed against a joint that no longer existed — a contact that silently never
  reports). 374 tests.

- **2026-08-20** — Joints landed, complete: registry, factories, all six chartered kinds, and
  `registerBuiltInPhysics3DJointSolvers`. Three layers — `jointMath.ts` (arithmetic), `jointRows.ts`
  (per-step state layout and the constraint families over it), `joints.ts` (kinds as compositions).
  Load-bearing primitive is the CONSTRAINT ROW: nine consecutive numbers — linear direction, angular
  arm on A, angular arm on B — addressed as `(state, offset)`, with mass, velocity, and impulse all
  reading the same block, so a row's three readings cannot describe different constraints. One
  convention across every axis-bearing kind: the primary axis is the FRAME'S LOCAL +X. Two things
  `physics2d` does differently and this package does not copy — anchor separation is built from the
  WORLD CENTRE OF MASS rather than the body origin, and the rotation error uses the true
  `2 * atan2(|v|, w)` angle rather than the `2 * v` shortcut, which is 10% short by a quarter turn.

- **2026-08-20** — Sleep islands and the flattened solve-island workspace, mirroring
  `physics2d/islands.ts`. Angular stillness is a MAGNITUDE, not per axis. Kinematic bodies
  deliberately do NOT break islands — a test pins it, because excluding them lets a crate sleep on a
  travelling lift.

- **2026-08-20** — The sequential-impulse contact solver. The 3D-specific piece is the COUPLED
  FRICTION CONE: two tangents clamped together, because clamping each to `friction * normalImpulse`
  alone admits `sqrt(2)` times that along the diagonal — a box that slides faster at 45 degrees than
  along either tangent, which reads as bad friction tuning rather than a geometry error.

- **2026-08-20** — Package created: the full `packages/types/src/Physics3D.ts` header ahead of the
  code, plus `symmetricTensor.ts`, `massProperties.ts`, `world.ts`, `integrate.ts`.

- **2026-08-20** — Two bugs the tests caught during the first build: `rotateSymmetricTensor` computed
  `R * I * R` rather than `R * I * transpose(R)`, and the type-change path recovered a forward inertia
  by reciprocating the inverse's diagonal.
