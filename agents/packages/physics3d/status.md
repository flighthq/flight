---
package: '@flighthq/physics3d'
updated: 2026-08-20
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

The package exists and simulates free motion. It does **not** yet resolve contacts, and it cannot
generate them at all.

- **No contact solver.** `Physics3DContactConstraint` and `Physics3DSequentialImpulseState` are
  defined in the header and allocated by `createPhysics3DWorld`, and nothing reads them.
  `world.contacts` is inert. The two-tangent friction basis, effective masses, warm starting by
  `featureId`, and the position pass are all unbuilt. This is the largest single gap and the next
  thing to build; it is buildable now, because the solver is defined against contact records and
  needs no narrow phase to be tested — hand-constructed manifolds are the intended test input.
- **No contact GENERATION, and none possible.** A 3D narrow phase does not exist
  (`agents/collision-support-registry.md`, unratified) and neither does a 3D broadphase
  (`agents/spatial-dimension-seams.md`, unratified). `Physics3DWorld` deliberately owns no index
  field: `SpatialIndexBackend` is the swap point and its 3D counterpart is what is missing. Do NOT
  close this by writing a narrow phase inside this package.
- **No joints.** `Physics3DJoint`, `Physics3DJointKind`, and `Physics3DJointSolver` are in the
  header — including the `dt` on `solve` that the solver ruling requires — but no registry, no
  factories, and none of the chartered kinds (ball-and-socket, hinge, slider, fixed, cone-twist,
  6-DOF) exist. `world.jointSolvers` and `world.jointCollisionSuppressions` are allocated and unread.
- **No islands or sleeping.** Every island field on the world is allocated and unread. `sleeping` is
  honoured by both integrators, and nothing ever sets it. `updatePhysics3DSleep` does not exist.
- **No `stepPhysics3D`.** There is no composed step and no substep loop. `config.substeps` is carried
  and unread. A caller drives `integrateRigidBody3DVelocity` / `integrateRigidBody3DPose` /
  `refreshRigidBody3DWorldInertia` itself, in that order, which is what the tests do.
- **No diagnostics.** `Physics3DStepExplanation` and `Physics3DJointExplanation` are defined; the
  `explain*` functions behind them are not written.
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

- **2026-08-20** — Package created. `packages/types/src/Physics3D.ts` is the full header (bodies,
  contacts, constraints, joints, config, world) even where the implementation is absent, so the
  design surface is reviewable ahead of the code. Built: `symmetricTensor.ts` (six-component
  symmetric 3x3 arithmetic — apply, invert, rotate, parallel-axis), `massProperties.ts` (sphere/box/
  capsule inertia plus combination), `world.ts` (world and body lifecycle, forces, the setters that
  have derived state behind them), `integrate.ts` (semi-implicit velocity and quaternion pose
  integration with the gyroscopic term). 101 tests; all 10 `npm run check physics3d` gates pass.
  Two decisions worth knowing: `RigidBody3D` stores its FORWARD inertia tensor as well as the
  inverse, because the inverse is zero for a static or fixed-rotation body and therefore holds
  nothing to restore from when it becomes dynamic again — and inverting the inverse's diagonal, which
  looks equivalent, is wrong for any tensor with off-diagonal terms. And solver accumulators are
  deliberately absent from `Physics3DContactPoint`, which carries geometry and identity only, per
  `agents/physics3d-solver-abstraction.md`; `Physics2DContactPoint` inlines them and this package
  does not copy that.
- **2026-08-20** — Two real bugs caught by tests during the build, both worth the tests that found
  them: `rotateSymmetricTensor` computed `R * I * R` instead of `R * I * transpose(R)` (agrees with
  the right answer under any symmetric rotation, disagrees on a quarter turn — the trace-preservation
  and quarter-turn cases caught it), and the first draft of the type-change path recovered a forward
  inertia by reciprocating the inverse's diagonal.
