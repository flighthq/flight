---
package: '@flighthq/physics3d'
updated: 2026-08-21
by: principal
---

# physics3d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

At file-level parity with `physics2d`. Bodies carry colliders, the step generates its own contacts
through the 3D broadphase and narrow phase, `world.events` reports begin/end transitions, and queries
(point, ray, region, shapecast), debug geometry, and a stress harness all ship. Integration, the contact
solver, all seven joint kinds, islands and sleeping, the substep loop, and three `explain*` seams are
built.

- **Contact generation dispatches through registries the CALLER must populate — diagnosable now, still
  not prevented.** `collideContactManifold3D` resolves a pair through `@flighthq/collision`'s support and
  face registries, so a world whose supports were never registered steps perfectly and detects nothing:
  bodies fall through floors in silence, the package's sharpest usability edge. Registration stays opt-in
  by design, but every layer now names it — `explainPhysics3DCollision` and `explainCollisionTest3D`
  report it as data, and `enableCollisionGuards` warns with a message naming
  `registerBuiltInCollisionSupports3D`. The 3D guard hook did not exist before this session. The 2D
  package has no equivalent trap, its manifold path being a closed switch.
- **A hull is triangulated ON DEMAND, three times over.** Mass properties, raycast, and the debug
  wireframe each call `writeCollisionConvexHullFaces3D` and each pay an O(n^2) build. Uncached by
  design: `CollisionConvex3D` is a bare point list, and a stored face set is a second source of truth
  that can disagree with its own points. The six closed-form kinds are the cheap path.
- **There is no triangle-mesh collider, and that is a boundary rather than a gap.** A support function
  determines a CONVEX shape, so a concave mesh cannot reach the narrow phase through the registry the
  way every built-in kind does. Adding one means a second dispatch path — mesh-vs-convex against a BVH
  of triangles — not another entry in the support registry.
- **A resting stack compresses about 0.03 per contact against a 0.005 slop target** — twelve boxes stand
  11.11 where the geometry says 11.5. Ordinary projected-Gauss-Seidel behaviour; more position iterations
  buy little of it back.
- **CCD arrests tunnelling LINEARLY and applies no torque at the impact.** A deliberate bound. The
  impact carries a real GJK WITNESS point, exact where the closest feature is interior to an edge, but
  one point cannot stand for a face-face contact: every point of the region ties, the witness settles on
  a CORNER, and a box driven squarely into a wall would take `r x n` about it and spin from a symmetric
  impact. (Measured: a five-unit lever arm inflated the angular term four orders of magnitude and cut a
  600-unit/s stop to a velocity change of 0.05.) The pass removes approach velocity through the centres
  of mass and leaves the pair touching; the next step's MANIFOLD supplies lever arms that cancel for a
  square hit and not a glancing one. `continuous.test.ts` pins the no-spin invariant.
- **Seven collider kinds.** Cylinder and cone joined sphere, aabb, box, capsule, and convex across every
  seam. Their broadphase bounds come from the DISC extent rather than the full radius, so an axis-aligned
  cylinder does not claim a box a radius too tall.
- **`queryPhysics3DShapeCast` reports only the FIRST hit, unlike the ray queries.** Not a reduced
  feature: a ray passes through a surface and continues, so "all hits along it" is well defined, while a
  swept shape stops at first contact and everything past it is a position it never reached.
- **CCD is LINEAR only, where `physics2d` also sweeps rotation.** A body spinning fast enough to catch
  something with a limb within a step is not covered; `maxCcdRotationSubsteps` has no 3D counterpart.
- **`preparePhysics3DContactConstraints` REQUIRES the island workspace.** It iterates the island contact
  slices rather than `world.contacts`, so a world stepped without `buildPhysics3DSolveIslands` produces
  no constraints at all. That is what makes a settled world cost no contact scan per sub-interval, and
  it moved the `enabled`/`sensor` filter upstream into the island builder — `touching` stays prepare's,
  because it changes without anything the workspace watches changing.
- **Cone-twist and generic 6-DOF veto `swapEnds`**, so either kind authored with `bodyA > bodyB` stays
  out of canonical order. Exact rather than cautious: a kind may exchange its ends only when its own
  constraint holds the two frames aligned on the axes its parameters are measured against, and both
  deliberately leave that alignment free.
- **A 6-DOF angular bound is the axis-angle error projected onto one frame axis.** Exact for rotation
  about a single axis — the dominant use — approximate for a combined one, where a per-axis
  decomposition would need Euler extraction and an order convention with it.
- **The gyroscopic term is explicit.** Standard at game timesteps, and why `substeps` is the lever for
  fast spinners; an implicit form is the upgrade if a body turns its own momentum within a step.
- **Every limited joint can now be COMPLIANT, and the distance joint's limits deliberately cannot.**
  Hinge, slider, cone-twist, and 6-DOF take `enableLimitSpring` with a frequency and damping ratio, all
  routed through one `writePhysics3DSoftRowParameters`. The distance joint alone is excluded: its
  compliance already lives on the rest row as `enableSpring`, and its limits exist to BOUND that spring
  — they read the unsoftened effective mass precisely so a stiff spring cannot stretch through its own
  stop. A soft limit stays one-sided; softening changes how hard a stop resists, never whether it may
  pull back the other way.
- **One bias slot serves rows of DIFFERENT masses, and that is exact rather than approximate.** The soft
  bias factor works out to `w^2 / (2*z*w + dt*w^2)`, in which the mass cancels; only the softened mass
  and gamma vary per row. Cone-twist's swing and twist share a slot on this basis, as do the 6-DOF axes.
  The corollary bit once: a FREE 6-DOF axis never has its row mass written, so feeding it to the spring
  produced NaN that the shared slot then spread to every other axis.
- **A broken joint STAYS IN THE WORLD.** It constrains nothing and no longer binds its bodies into one
  island, but removing it is the caller's: what a break means is not the solver's to decide, and a joint
  that deleted itself would leave nothing to inspect. `physics2d` has no breakage at all yet.
- **The guard module covers the declined STEP and the undetectable COLLIDER, not the unregistered
  JOINT.** A joint whose kind has no solver is skipped without a word, though `explainPhysics3DJoints`
  already classifies it. Closing it means a third seam, not a second module.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-21** — Compliant limits on hinge, slider, cone-twist, and 6-DOF, all through one
  `writePhysics3DSoftRowParameters`; the distance joint's rest row was refactored onto the same helper
  and its behaviour is unchanged. The helper takes the HARD bias factor as a parameter rather than
  baking one in, because the two callers legitimately disagree — a two-sided rest row corrects at
  `BAUMGARTE / dt` and a one-sided stop fully at `1 / dt` — and baking either in would have silently
  changed the other's hard behaviour. A test caught the one real defect: a FREE 6-DOF axis has no row
  mass written, so preparing a spring for it produced NaN that the shared bias slot then spread to every
  other axis, turning a working joint into NaN wholesale.

- **2026-08-21** — Cylinder and cone colliders, and `queryPhysics3DShapeCast`. The shapecast asks the
  broadphase for the SWEPT bounds — the shape's box unioned with that box shifted by the displacement —
  because querying the start box returns what the shape already touches and misses everything it is
  about to reach, which is the whole question. Its swept box is derived by the same
  `writePhysics3DColliderBounds` the broadphase indexes with, rather than a second bounds implementation
  free to disagree the next time a kind is added. A cone's centroid is three quarters of the way from
  apex to base, not the axis midpoint; using the midpoint would offset every cone body by an eighth of
  its height.

- **2026-08-21** — Joint REACTIONS and breakage. `writePhysics3DJointReaction` reports the force and
  torque a joint is carrying, measured at the ANCHOR so the two readings are independent — the row helper
  subtracts `rB x direction`, which is exactly the torque a linear row exerts about the centre purely by
  acting at an offset, and leaving it in would make a hanging weight register as twist. Each of the seven
  kinds reports its own, because the `impulse0..5` slots mean different things per kind (three world axes
  for a point block, one axial scalar for a distance joint) and only the kind that wrote them can say what
  they sum to. `breakForce`/`breakTorque` then read that same public number, so a threshold fires on a
  value the caller could have inspected first. One real bug, and it was already shipped in the distance
  joint: `isPhysics3DJointValid` walks every numeric field and rejects non-finite, so the infinite defaults
  (`breakForce`, and `maxLength` on a rope) made every joint invalid and the world DECLINED TO STEP —
  silently, since an invalid step is skipped rather than thrown. It presented as a hinge motor that would
  not turn and contacts that never fired, with nothing naming the joint. The validator now exempts the
  fields where infinity is the value; `stepValidation.test.ts` pins it.

- **2026-08-21** — GJK witness points, and the 3D DISTANCE joint. `writeCollisionDistance3D` now reports
  the closest point on each shape, recovered by applying the closest point's barycentric weights to the
  per-shape support points the simplex was built from — which required the reduction to report surviving
  vertices and weights instead of compacting the simplex in place. Two crossing capsules are closest
  MID-SEGMENT, where the old support-along-the-normal call named a segment end two units adrift on a
  four-unit capsule; the swept contact point uses the witness now. It buys nothing for PARALLEL faces,
  measured and documented rather than assumed: every point ties, the search stops at the first vertex, and
  the answer is a corner either way. One bug the existing tests caught: a head-on approach converges onto
  exactly touching, so the last measurement with a gap can be a whole interval back, and the witness has
  to be ADVANCED to the impact rather than carried as-is (the direction survives the trip; a position does
  not). Then `Physics3DDistanceJointKind` — one row, three behaviours off two independent flags: rigid at
  `length`, a spring toward it at a frequency and damping ratio, and one-sided `minLength`/`maxLength`
  stops. Enabling the limit without the spring drops the rest-length row, which is what a rope means. The
  limit rows read the UNSOFTENED effective mass so a stiff spring cannot stretch through its own stop.

- **2026-08-21** — Continuous collision, the last parity gap. Three new pieces:
  `writeCollisionDistance3D` (GJK DISTANCE — a separate routine from the overlap test, because that one
  reduces its simplex to a search direction and this needs a closest POINT with barycentric weights),
  `sweepCollisionShape3D` (conservative advancement, which cannot skip a thin wall the way sampling does),
  and `continuous.ts` (swept broadphase, chronological impact ordering, `maxCcdSubsteps` as a hard bound).
  A bullet at 600 units/second now stops at a 0.1-thick wall it previously crossed in one step, with the
  CCD-off control pinned alongside it. Two bugs found on the way: the distance query's convergence test had
  `v.v + v.w` where the derivation gives `v.v - v.w`, which made it wrong in BOTH directions at once
  (penetrating pairs reported a gap, separated pairs never converged); and the swept contact point was
  offset by the RELATIVE translation rather than A's own, putting a static wall's corner five units from
  the wall.

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
