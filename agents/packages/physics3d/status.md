---
package: '@flighthq/physics3d'
updated: 2026-08-21
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
- **`preparePhysics3DContactConstraints` now REQUIRES the island workspace.** It iterates the island
  contact slices rather than `world.contacts`, so a world stepped without `buildPhysics3DSolveIslands`
  produces no constraints at all. That is what makes a settled world cost no contact scan per
  sub-interval, and it moved the `enabled`/`sensor` filter upstream into the island builder —
  `touching` stays prepare's, because it changes without anything the workspace watches changing. The
  velocity and position passes stay flat over the emitted list: with a fixed iteration count and
  disconnected islands, per-island loops would be the same work in the same order.
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
- **The guard module covers the declined STEP, not yet the unregistered JOINT.**
  `enablePhysics3DGuards` installs a seam on `stepPhysics3D`'s silent decline and reports every failing
  precondition in one message, keyed on the failing set so a frame loop logs once. The other silent
  sentinel is still unwarned: a joint whose kind has no registered solver is skipped without a word,
  and `explainPhysics3DJoints` already classifies it as `unregistered-kind`. Closing it means a second
  seam on the joint pass, not a second module.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

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
