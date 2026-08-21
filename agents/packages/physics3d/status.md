---
package: '@flighthq/physics3d'
updated: 2026-08-21
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

At file-level parity with `physics2d` except for CCD. Bodies carry colliders, the step generates its own
contacts through the 3D broadphase and narrow phase, `world.events` reports begin/end transitions, and
queries, debug geometry, and a stress harness all ship. Integration, the contact solver, all six joint
kinds, islands and sleeping, the composed step with its substep loop, and three `explain*` seams are
built.

- **Contact generation dispatches through registries the CALLER must populate.** `collideContactManifold3D`
  resolves a pair through `@flighthq/collision`'s support and face registries, so a world whose supports
  were never registered steps perfectly and detects nothing — bodies fall through floors in silence. This
  is the package's sharpest usability edge. `explainPhysics3DCollision` reports it as data and
  `enablePhysics3DGuards` phrases it, but nothing forces the call, because registration is opt-in by
  design. The 2D package has no equivalent trap: its manifold path is a closed switch.
- **A hull is triangulated ON DEMAND, three times over.** Mass properties, raycast, and the debug
  wireframe each call `writeCollisionConvexHullFaces3D` and each pay an O(n^2) build. That is correct and
  it is not cached anywhere, because `CollisionConvex3D` is a bare point list by design and a stored face
  set is a second source of truth that can disagree with its own points. A caller raycasting the same
  hull every frame is paying the build every frame; the four closed-form kinds are the cheap path.
- **`bullet` and `continuousCollision` are carried and unread.** CCD needs a swept 3D narrow phase.
  `physics2d` has linear AND rotational CCD; this is the largest remaining parity gap.
- **There is no triangle-mesh collider, and that is a boundary rather than a gap.** A support function
  determines a CONVEX shape, so a concave mesh cannot reach the narrow phase through the registry the way
  every built-in kind does. Adding one means a second dispatch path — mesh-vs-convex against a BVH of
  triangles — not a sixth entry in the support registry.
- **A resting stack still compresses about 0.03 per contact against a 0.005 slop target.** Twelve boxes
  stand 11.11 where the geometry says 11.5. That is ordinary projected-Gauss-Seidel behaviour under load
  rather than a defect, and the stress harness bounds it — but it is the number to watch if stacking
  quality is ever raised, and more position iterations buy very little of it back.
- **CCD is the last parity gap.** `bullet` and `continuousCollision` are carried on the body and the
  config and read by nothing, so a fast 3D mover tunnels. `physics2d` has both linear and rotational CCD;
  closing this needs a SWEPT 3D narrow phase, which the support registry can carry (a swept convex is a
  convex) but which nothing yet calls.
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

- **2026-08-21** — Convex hulls, and the one primitive three gaps were waiting on.
  `writeCollisionConvexHullFaces3D` (incremental hull, outward-wound) closes hull MASS PROPERTIES
  (integrated over the triangulation by the divergence theorem — a cube hull reproduces the closed-form
  box tensor exactly), hull RAYCAST (half-space clipping against the face planes, which also agrees with
  the equivalent aabb), and the hull DEBUG WIREFRAME. Plus 3D debug geometry as a whole
  (`writePhysics3DDebugGeometry`, lines and spheres only), and the stale physics rows in
  `agents/maturity-gaps.md` marked resolved. One real bug caught by a differential test: the hull tensor
  was shifted onto the centre of mass by negating the OFFSETS, which does nothing because they are
  squared, so the parallel-axis term was doubled instead of removed — invisible for a centred hull, and
  only an offset one shows it.

- **2026-08-21** — Stress and determinism harness, and the bug it found. `solvePhysics3DContactPositions`
  was correcting penetration against the depth captured at INTAKE and never re-measuring, so every
  position iteration drove a quantity that could not change — the classic stale-Gauss-Seidel failure. It
  now regenerates each contact from the colliders immediately before solving it, exactly as `physics2d`
  does, with lever arms recomputed from the current centres. A twelve-box pile went from 0.27 of sink at
  its base to 0.47, and from 8.54 to 11.11 tall. Invisible to every single-contact test, which is why
  the harness had to exist: six long-horizon claims (tall pile, driven joint chain, exact-repeat trace,
  INSERTION-ORDER-independence, workspace retention, and a torque-free spinner). The spinner nearly
  produced a false bug report — angular momentum appeared to grow 40% and to get worse with more
  substeps, which was a WRONG-FRAME metric (world-frame omega against the local tensor), not a wrong
  gyroscopic term; corrected, the drift halves as the sub-interval does, and the test now asserts that
  convergence rather than a fixed bound.

- **2026-08-21** — 3D spatial queries, at parity with `physics2d`'s seven: `queryPhysics3DPoint`,
  `-Ray`, `-RayClosest`, `-Region`, plus the filter and two result constructors, all over the same index
  the step drives and all synchronizing the broadphase first so a query between steps sees the current
  pose. Needed two new `collision` primitives — `getCollisionShapeContainsPoint3D` and
  `raycastCollisionShape3D` (with `CollisionRaycastHit3D`). Point containment is exact and
  boundary-inclusive for sphere/aabb/box/capsule; a HULL is answered by GJK against a zero-radius sphere
  rather than a fifth hand-rolled predicate, which makes its surface exclusive and gives it the only
  registration dependency among the kinds. Raycast is closed-form for the four, with the capsule
  decomposed into two cap spheres plus a finite cylinder rather than fused into one quadratic — the fused
  form is where a capsule's caps go subtly wrong.

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
