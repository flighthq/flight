---
package: '@flighthq/physics3d'
updated: 2026-08-20
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The package simulates free motion, resolves contacts it is given, holds bodies together with the
full built-in joint bank, and sleeps settled islands. It cannot GENERATE a contact, and it has no
composed step.

- **No contact GENERATION, and none possible.** A 3D narrow phase does not exist
  (`agents/collision-support-registry.md`, ratified but unbuilt) and neither does a 3D broadphase
  (`agents/spatial-dimension-seams.md`, ratified but unbuilt). `Physics3DWorld` deliberately owns no
  index field: `SpatialIndexBackend` is the swap point and its 3D counterpart is what is missing. A
  caller supplies contacts directly. Do NOT close this by writing a narrow phase inside this package.
- **No `stepPhysics3D`.** There is no composed step and no substep loop, so nothing yet calls the
  pieces in order. `config.substeps` is carried and unread. A caller drives
  `integrateRigidBody3DVelocity` / `integrateRigidBody3DPose` / `refreshRigidBody3DWorldInertia`,
  the contact prepare/warm-start/iterate/position passes, and each joint's
  `prepare` / `warmStart` / `solve` itself, which is what the tests do. This is the next thing to
  build, and it is what makes `ownership.ts` live: `steppingPhysics3DWorlds` is populated by nothing
  today, so the mutation guard on the joint lifecycle can only be reached from a test.
- **No diagnostics.** `Physics3DStepExplanation` and `Physics3DJointExplanation` are defined; the
  `explain*` functions behind them are not written. `Physics3DJointExplanation.status` already names
  `unregistered-kind`, which is the sentinel a caller most needs surfaced — a joint whose kind has
  no registered solver is skipped by the step in total silence.
- **One-sided joint limits are not warm-started.** Every limit accumulator lives in per-step scratch
  and starts each substep from zero; only the equality rows and the point/angular blocks carry across
  in `impulse0..5`. Uniform across all six kinds and matching `physics2d`, at the cost of a resting
  limit re-converging every step. Revisit if a loaded ragdoll visibly sags into its stops.
- **Cone-twist and generic 6-DOF refuse to exchange their ends.** Both veto `swapEnds`, so a joint of
  either kind authored with `bodyA > bodyB` stays out of canonical order. The reason is exact rather
  than cautious: a kind may exchange its ends only when its own constraint holds the two frames
  aligned on the axes its parameters are measured against, and both of these deliberately leave that
  alignment free. `physics2d`'s wheel and mouse joints have the same property.
- **A 6-DOF angular bound is the axis-angle error projected onto one frame axis.** Exact for rotation
  about a single axis, which is the dominant use and the only one a locked axis can reach;
  approximate for a combined rotation, where a true per-axis decomposition would need Euler
  extraction and an order convention to go with it.
- **`bullet` and `continuousCollision` are carried and unread.** CCD needs a swept 3D narrow phase.
  The fields exist so the shape is reserved, not because anything honours them.
- **Mass properties cover three primitives.** Sphere, box, and capsule have closed forms and are
  built. Convex hull and triangle mesh are integrals over geometry and arrive with the narrow phase
  that produces those shapes.
- **The gyroscopic term is explicit.** `omega x (I * omega)` is applied as an explicit torque, which
  is standard at game timesteps and is why `substeps` is the lever for fast spinners. An implicit
  form is the upgrade if a body spinning fast enough to turn its momentum within one step ever
  matters.
- **`refreshRigidBody3DWorldInertia` is a manual pull.** Nothing calls it automatically except
  `addPhysics3DBody`, `setPhysics3DBodyTransform`, and `setPhysics3DBodyType`. Once `stepPhysics3D`
  exists it belongs at the top of each substep, and the ordering trap is real: integrating angular
  velocity against last substep's world tensor is wrong in a way that only shows on a rotating
  asymmetric body.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-20** — Joints landed, complete: registry, factories, all six chartered kinds, and
  `registerBuiltInPhysics3DJointSolvers`. Three layers — `jointMath.ts` (arithmetic), `jointRows.ts`
  (per-step state layout and the constraint families over it), `joints.ts` (kinds as compositions of
  those). Load-bearing primitive is the CONSTRAINT ROW: nine consecutive numbers — linear direction,
  angular arm on A, angular arm on B — addressed as `(state, offset)`, with mass, velocity, and
  impulse all reading the same block, so a row's three readings cannot describe different
  constraints. One convention across every axis-bearing kind: the primary axis is the FRAME'S LOCAL
  +X. Two things `physics2d` does differently and this package does not copy — a joint's anchor
  separation is built from the WORLD CENTRE OF MASS rather than the body origin (adding a
  centre-relative arm to the origin lands on the anchor only when the two coincide, and the error
  does not cancel between the ends), and the rotation error uses the true `2 * atan2(|v|, w)` angle
  rather than the `2 * v` shortcut, which is 10% short by a quarter turn.

- **2026-08-20** — Sleep islands and the flattened solve-island workspace, mirroring
  `physics2d/islands.ts`. Two 3D divergences: angular stillness is a MAGNITUDE, not per axis (three
  axes each just under the threshold is a body tumbling at `sqrt(3)` times it), and sleeping zeroes
  all three components. Kinematic bodies deliberately do NOT break islands — a test pins it, because
  excluding them lets a crate sleep on a travelling lift.

- **2026-08-20** — The sequential-impulse contact solver. The 3D-specific piece is the COUPLED
  FRICTION CONE: two tangents clamped together, because clamping each to `friction * normalImpulse`
  on its own admits `sqrt(2)` times that along the diagonal — a box that slides measurably faster at
  45 degrees than along either tangent, which reads as bad friction tuning rather than as a geometry
  error, and which cannot occur in 2D.

- **2026-08-20** — Package created: `packages/types/src/Physics3D.ts` (the full header, ahead of the
  code, so the design surface is reviewable), `symmetricTensor.ts`, `massProperties.ts`, `world.ts`,
  `integrate.ts`. `RigidBody3D` stores its FORWARD inertia tensor as well as the inverse, because the
  inverse is zero for a static or fixed-rotation body and holds nothing to restore from — and
  inverting the inverse's diagonal, which looks equivalent, is wrong for any tensor with off-diagonal
  terms. Solver accumulators are deliberately absent from `Physics3DContactPoint`, per
  `agents/physics3d-solver-abstraction.md`; `Physics2DContactPoint` inlines them.

- **2026-08-20** — Two real bugs caught by tests during the build, both worth the tests that found
  them: `rotateSymmetricTensor` computed `R * I * R` instead of `R * I * transpose(R)` (agrees with
  the right answer under any symmetric rotation, disagrees on a quarter turn — the trace-preservation
  and quarter-turn cases caught it), and the first draft of the type-change path recovered a forward
  inertia by reciprocating the inverse's diagonal.
