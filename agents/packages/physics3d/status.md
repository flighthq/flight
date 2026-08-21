---
package: '@flighthq/physics3d'
updated: 2026-08-21
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Feature-complete against the charter and now DETECTING: bodies carry colliders, the step generates its
own contacts through the 3D broadphase and narrow phase, and `world.events` reports begin/end
transitions. Integration, the contact solver, all six joint kinds, islands and sleeping, the composed
step with its substep loop, and three `explain*` seams are built.

- **Contact generation dispatches through registries the CALLER must populate.** `collideContactManifold3D`
  resolves a pair through `@flighthq/collision`'s support and face registries, so a world whose supports
  were never registered steps perfectly and detects nothing — bodies fall through floors in silence. This
  is the package's sharpest usability edge. `explainPhysics3DCollision` reports it as data and
  `enablePhysics3DGuards` phrases it, but nothing forces the call, because registration is opt-in by
  design. The 2D package has no equivalent trap: its manifold path is a closed switch.
- **A convex-hull collider has NO mass and acts as immovable scenery.** Its inertia is a volume integral
  over a triangulation a bare point list does not carry, so `computePhysics3DColliderMassData` zeroes it
  rather than substituting a bounding box's tensor — inert beats plausibly wrong. It still collides
  normally. Closing this needs a hull triangulation, which is also what a triangle-mesh collider wants.
- **`bullet` and `continuousCollision` are carried and unread.** CCD needs a swept 3D narrow phase.
  `physics2d` has linear AND rotational CCD; this is the largest remaining parity gap.
- **No spatial queries.** `physics2d` exposes seven (`queryPhysics2DPoint`, `-Ray`, `-RayClosest`,
  `-Region`, and three result constructors) over the same index the step uses. The 3D index is now in
  place and unused by any query.
- **No stress or determinism harness.** `physics2d/src/stress.test.ts` runs a tall pile to settle over
  900 steps, a driven joint chain over 1200, an exact-repeat determinism trace, and a contact-identity
  retention check. `contactIntake.test.ts` covers a two-box stack and one determinism trace; that is a
  smaller claim than the 2D harness makes.
- **No debug geometry.** `physics2d/src/debugGeometry.ts` has no 3D counterpart.
- **`preparePhysics3DContactConstraints` REQUIRES the island workspace.** It iterates the island contact
  slices rather than `world.contacts`, so a world stepped without `buildPhysics3DSolveIslands` produces
  no constraints at all. That is what makes a settled world cost no contact scan per sub-interval, and it
  moved the `enabled`/`sensor` filter upstream into the island builder — `touching` stays prepare's,
  because it changes without anything the workspace watches changing. The velocity and position passes
  stay flat over the emitted list: with a fixed iteration count and disconnected islands, per-island
  loops would be the same work in the same order.
- **Cone-twist and generic 6-DOF veto `swapEnds`**, so either kind authored with `bodyA > bodyB` stays
  out of canonical order. Exact rather than cautious: a kind may exchange its ends only when its own
  constraint holds the two frames aligned on the axes its parameters are measured against, and both
  deliberately leave that alignment free. `physics2d`'s wheel and mouse joints likewise.
- **A 6-DOF angular bound is the axis-angle error projected onto one frame axis.** Exact for rotation
  about a single axis — the dominant use, and the only one a locked axis reaches — approximate for a
  combined rotation, where a per-axis decomposition would need Euler extraction and an order convention
  with it.
- **The gyroscopic term is explicit.** Standard at game timesteps, and why `substeps` is the lever for
  fast spinners. An implicit form is the upgrade if a body turns its own momentum within a step.
- **The guard module covers the declined STEP and the undetectable COLLIDER, not yet the unregistered
  JOINT.** A joint whose kind has no registered solver is skipped without a word, and
  `explainPhysics3DJoints` already classifies it as `unregistered-kind`. Closing it means a third seam on
  the joint pass, not a second module.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — Contact intake. `RigidBody3D` gained `colliders` and LOST its body-level
  `material`/`filter`, which nothing read and which a compound body cannot share; both now sit on
  `Physics3DCollider`. `Physics3DWorld` gained `index: SpatialIndexBackend3D` (uniform grid, one world
  unit per cell like `physics2d` — the spatial default of 128 is sized for pixels and would put a whole
  scene in one cell). New `colliderTransform.ts` (local-to-world by kind, aabb promoting to an oriented
  box), `broadphase.ts` (body bounds, unioned over colliders), `contactIntake.ts` (pair ordering, filter
  and sensor rules, persistent contact matching on the four identity fields, `world.events`), and
  `material.ts`. `computePhysics3DColliderMassData` / `updateRigidBody3DMassData` derive a body's tensor
  from its geometry — including the two rotations a diagonal tensor needs, which are the silent-failure
  cases: a locally rotated box stops being diagonal in the body frame, and a capsule off the Y axis needs
  its symmetry axis realigned. Contact LIFETIME moved to intake, so hand-pushed contacts are retired by
  the next step; `step.test.ts`'s fixture now builds real geometry. Third `explain*` seam added,
  `explainPhysics3DCollision`, for the one failure the output cannot signal: unregistered collision
  supports, measured to drop a crate to y=-75 with zero contacts and no error.

- **2026-08-21** — Solve islands now drive contact constraint building (`solver.ts` iterates the island
  contact slices, so a settled world costs no per-sub-interval scan and `prepare` requires the
  workspace); one-sided joint limits warm-start across steps on all four limited kinds via new
  persisted accumulators on the joint types (`swapEnds` exchanges rather than negates them, because
  they are magnitudes and the bounds are coordinates); `enablePhysics3DGuards` added over a new
  `setPhysics3DStepGuard` seam.

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
