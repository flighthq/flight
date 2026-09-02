---
package: '@flighthq/physics3d'
status: solid
score: 96
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - performance.md
  - source
  - tests
  - types surface (Physics3D.ts)
  - collision and spatial seams
---

# Physics3D qualification review

This is the measurable release gate for calling `@flighthq/physics3d` AAA-complete. "AAA" is not a
feature count: it means the promised operating envelope has thresholds, repeatable evidence, and no
known charter hole inside it.

## Verdict

**AAA-qualified TypeScript rigid-body core; full charter qualification remains open at the native
target.** Every feature, numerical, terrain, performance/allocation, lifecycle, diagnostic, determinism,
and CCD gate in the executable TypeScript target has a checked-in challenge scene. The package ships 36
source files, 35 test files, and 712 test cases. All seven charter joint kinds are implemented and
qualified with warm starting, compliant limits, breakage, and reaction reporting. The solver's
sequential-impulse architecture is cleanly separated from the contact data model per the charter's
partitioning obligation. `@flighthq/physics3d-abi` establishes the native ownership contract as a
distinct public package, but the explicitly paused Rust/WASM target has no implementation or parity
evidence; this review does not substitute a portable TypeScript implementation for evidence from
that target.

## Present capabilities

**World and body lifecycle.** `createPhysics3DWorld` accepts a pluggable `SpatialIndexBackend3D`
(defaulting to a one-unit uniform grid). Bodies carry position, orientation (quaternion), linear/angular
velocity, force/torque accumulators, full 3x3 symmetric inertia tensor (forward and inverse, local and
world), centre of mass, damping, gravity scale, bullet flag, and per-body sleep opt-out. `addPhysics3DBody`,
`removePhysics3DBody`, and body mutations (`setPhysics3DBodyType`, `setPhysics3DBodyTransform`,
`setPhysics3DBodyFixedRotation`, `setPhysics3DBodyBullet`, `setPhysics3DBodySleepEnabled`) each
rebuild the derived state that should accompany them (inverse mass, world inertia, constraint caches,
broadphase publication). Compound colliders are supported via `addPhysics3DCollider`/`removePhysics3DCollider`
with per-collider material, filter, and sensor flag. `invalidatePhysics3DCollider` handles in-place
shape mutation.

**Explicit step.** `stepPhysics3D(world, dt)` is the single entry point. It declines silently on
failed preconditions (non-finite velocities, zero timestep, malformed colliders) rather than throwing,
with the diagnostic seam `explainPhysics3DStep` available separately. The step composes named sub-functions
(`stepPhysics3DInterval`, `integrateRigidBody3DVelocity`, `integrateRigidBody3DPose`,
`refreshRigidBody3DWorldInertia`, `clearRigidBody3DForces`) that are individually exported for custom
loop assembly. Substeps are a first-class parameter (`config.substeps`), structurally reserved from
the first release.

**Integration.** Semi-implicit (symplectic) Euler. Angular velocity is integrated using the quaternion
derivative with renormalization. Gyroscopic torque (`omega x (I * omega)`) is computed explicitly using
the forward world inertia tensor. Damping uses exponential decay rather than subtraction so large
timesteps cannot reverse a velocity.

**Sequential-impulse solver.** Velocity and position iteration counts, penetration slop, Baumgarte
position correction fraction, restitution threshold, and warm starting are configurable. Contact
constraints use coupled cone friction (two tangent directions clamped jointly, preventing the sqrt(2)
diagonal error). Position correction regenerates the manifold per iteration, achieving true non-linear
Gauss-Seidel convergence. Solver accumulators are matched across steps by `featureId`.

**Seven joint kinds.** BallAndSocket (3-row point block), Distance (1 axial row with spring/limit
modes), Fixed (point + angular block), Hinge (point + axis + 2 lock rows, motor, limits), Slider
(2 perpendicular linear + 3 angular + axis with motor/limits), ConeTwist (point + swing limit +
twist limits), Generic6Dof (6 independent axes, each free/locked/limited). All kinds implement
`prepare`, `solve`, `warmStart`, `clearAccumulatedImpulses`, and `writeReaction`. Where applicable,
`swapEnds` and `scaleAccumulatedImpulses` are provided. Compliant limits (`enableLimitSpring` with
`limitFrequencyHz`/`limitDampingRatio`) are available on Hinge, Slider, ConeTwist, and Generic6Dof.
Joint solvers are registered per world via an open registry; `registerBuiltInPhysics3DJointSolvers`
registers all seven at once.

**Joint breakage and reactions.** `breakForce`/`breakTorque` thresholds on every joint.
`evaluatePhysics3DJointBreakage` fires per step; broken joints remain in `world.joints` for caller
inspection and publish through `world.jointEvents.broke`. Reaction forces/torques are readable via
`writePhysics3DJointReaction`, measured at the anchor in world space and expressed as force (not
impulse).

**Islands and sleeping.** Union-find with path compression. Sleep is decided per island (minimum
timer across members). Kinematic bodies join islands (keeping riders awake) while static bodies do
not (preventing one world-sized island). Force/torque accumulators are checked in stillness tests so
a sleeping body cannot swallow an applied force. `keepsBodiesAwake` on `Physics3DJointSolver` prevents
externally-driven joints from having their bodies fall asleep.

**CCD.** Translation always uses collision's analytic convex sweep. Rotation uses bounded angular
sampling at a one-degree target increment under `maxCcdRotationSubsteps`, with bisection on first
overlap and manifold-based resolution with angular effective mass. Solid TOI impacts run contact
hooks and publish persistent contacts; sensors do not resolve or run hooks. The exported
`writePhysics3DRotationalCcdEnvelope` reports the exact gap when the budget binds.

**Queries.** `queryPhysics3DPoint`, `queryPhysics3DRay`, `queryPhysics3DRayClosest`,
`queryPhysics3DRegion`, `queryPhysics3DShapeCast`. All synchronize the broadphase before executing,
returning deterministic results ordered by body/collider index. High-water result buffers prevent
per-frame allocation.

**Mass properties.** Per-shape mass data computation for sphere, box, capsule, cone, cylinder, and
convex hull. `combinePhysics3DMassData` uses the parallel-axis theorem for compound bodies.
`setRigidBody3DMassData` applies authored mass directly. `updateRigidBody3DMassData` derives from
colliders.

**Debug geometry.** `writePhysics3DDebugGeometry` emits lines and spheres for colliders, contacts,
joints, and centres of mass. High-water buffers, renderer-neutral.

**Diagnostics.** `enablePhysics3DGuards` installs four opt-in seams: declined steps, undetectable
collider kinds, unresolved joints, and broadphase overflow. Each emits through `@flighthq/log` with
`logOnce` keying. `explainPhysics3DStep`, `explainPhysics3DCollision`, and `explainPhysics3DJoints`
return plain data without side effects. All are tree-shakeable.

**Node sync.** `syncPhysics3DBodyToNode3D` copies body pose onto a `Node3D` and calls
`invalidateNodeLocalTransform`.

**Hydration.** `hydratePhysics3DWorld` upgrades reconstructed worlds across four schema versions,
replacing solver caches and backfilling fields added since version 0.

## Gaps

1. **No Rust/WASM implementation.** The charter names the Rust crate as the performance target; it
   remains deliberately paused by user direction. No parity suite, ownership measurements, or
   JS/WASM crossing budget exist.
2. **Active ragdoll is a proposed integration, not a shipped primitive.** Skeleton-body binding,
   multi-axis pose drive, animation/physics transitions, and recovery semantics are deferred to a
   proposed `@flighthq/ragdoll3d` package. If that controller proves a target-orientation motor is
   generally useful, the low-level primitive belongs in physics3d.
3. **No angular impulse helper.** `applyPhysics3DTorque` and `applyPhysics3DForceAtPoint` exist, but
   there is no `applyPhysics3DAngularImpulse` for an instantaneous angular velocity change at the
   centre of mass without a world-space point. `applyPhysics3DLinearImpulseAtPoint` handles the
   compound case; a direct angular impulse would be the torque counterpart of
   `applyPhysics3DLinearImpulse`.

## Charter contradictions

- **Dependency list.** The charter states `Dependencies: geometry (Vector3, Quaternion, Matrix4, Aabb),
  math, types`. The actual runtime dependencies are `collision`, `log`, `math`, `node`, `spatial`, and
  `types`. `geometry` is a devDependency (used in tests). The charter was written before the narrowing
  pass that moved narrow-phase and broadphase to `collision` and `spatial` respectively; the listed set
  is stale rather than wrong, but it should be updated.
- **GJK/EPA as new code.** The charter states "GJK/EPA narrow-phase ... This is new code, not in
  `@flighthq/collision`." The [2026-08-20] decision then resolves this: "3D narrow phase lives in
  `@flighthq/collision`." The earlier wording in the charter's North Star section is now contradicted
  by its own Decisions section. Cleaning up the stale phrasing would remove the contradiction.

## Contract and docs fit

**Export lanes.** Two lanes (`.` and `./contract`) are correctly configured in `package.json`. The
public lane (`index.ts`) exports only functions and kind constants. The contract lane (`contract.ts`)
re-exports all modules. No subpath exports exist.

**Type home.** All exported types reside in `@flighthq/types/contract` (`Physics3D.ts`). The
implementation package exports zero interfaces, types, or enums. Verified by grep.

**Side effects.** `"sideEffects": false` is declared. No source file registers anything at module top
level. Scratch arrays and pools sit at file bottom, after exported functions, matching source style
rules.

**Intra-SDK imports.** All non-test imports from other `@flighthq/*` packages use the `/contract`
subpath. No source file imports from `@flighthq/sdk`.

**Naming.** Exported functions use the full unabbreviated domain name (`Physics3D`, `RigidBody3D`).
Names are globally self-identifying. `get*`, `has*`, `is*` conventions are observed. `create*`
allocates. `set*` exists only where derived state must accompany a write.

**Diagnostics inversion.** Core modules expose seams (`setPhysics3DStepGuard`,
`setPhysics3DContactIntakeGuard`, `setPhysics3DJointResolutionGuard`,
`setPhysics3DSpatialIndexingGuard`), never messages. `enablePhysics3DGuards` installs callers that
emit through `@flighthq/log`. `explain*` functions return plain data. Guards are separately importable
and tree-shake out when unused.

**Invalidation.** Collider mutation goes through `invalidatePhysics3DCollider`. Body-type/transform
changes go through `set*` functions that rebuild derived state. Solver caches are invalidated on
topology mutations. The invalidation doctrine is implemented correctly.

**Allocation.** `create*` allocates. Integration, constraint solving, and island building write into
world-owned workspace arrays and solver scratch, retaining high-water capacity. Checked-in
performance ceilings enforce retained-heap-per-step and transient-allocation-per-step budgets.

**Testing.** One test file per source file, colocated in `src/`, named `*.test.ts`. 35 test files,
712 test cases. Stress tests cover long-horizon stacks, mass ratios, restitution, friction isotropy,
angular convergence, determinism, and workspace retention.

## Passing evidence

| Gate | Evidence | Current result |
| --- | --- | --- |
| Package correctness | `npx vitest run packages/physics3d/src --maxWorkers=2` | 35 files, 712 tests pass |
| Collision integration | `npx vitest run packages/collision/src packages/physics3d/src --maxWorkers=2` | integrated pass |
| Static checks | `npm run typecheck`, `npm run exports:check`, `npm run order`, `npm run api:check`, `npm run portable:check` | pass |
| Long stack | 12 unit boxes, four retaining walls, 900 steps at 60 Hz | finite, ordered, supported, asleep; top > 11 |
| Mass ratios | fixed-rotation 2-box stack, 600 steps | 100:1 default and 1,000:1 at 4 substeps: separation > 0.99, asleep |
| Restitution | elastic sphere between flat walls, 3,600 steps | speed 6 within 9 decimals, angular speed < 1e-9, contained |
| Friction isotropy | fixed box at speed 5, axis and diagonal, 240 steps | both stop; travel differs < 0.005, cross-axis drift < 0.001 |
| Joint endurance | 12-link driven 3D ball joint chain, 1,200 steps | finite; maximum link error < 0.025 |
| Angular integration | asymmetric torque-free spinner at 1, 2, and 4 substeps | finite; drift shrinks by at least 30% per halving and ends < 5% |
| Substep topology | one 1/30 step at 2 substeps versus two 1/60 steps through first impact | pose and velocity agree to 12 decimals |
| Workspace retention | stable contacts, islands, solver constraints/points/maps, grid/BVH pair output | object identity retained across steady topology |
| Determinism | exact repeat trace and reversed insertion-order trace | exact equality |
| Static concave terrain | 17 x 17 accelerated mesh and heightfield, 16 distributed boxes, 900 steps | all finite, supported at y 0.49-0.52, asleep |
| Terrain seams | transformed/version-invalidated local BVH, manifold reduction, raycast, shapecast, CCD, debug geometry | regression-covered |
| Performance | `npm run benchmark:physics3d`; 256-contact stack, 256 sparse movers, and a 256-body 64:1 mixed-scale scene on default/tuned grid and BVH | all checked-in CPU p95, heap, exact indexing-mode, and candidate-pair ceilings pass |
| Linear CCD | 0.1-wide wall, bullet at 600 units/s over a 1/60 s step | remains on near side |
| Rotational CCD | long blade crosses a peg only between start/end orientations | deflects and loses angular speed |
| CCD impact semantics | TOI friction/restitution, pre/post hooks, persistent begin/end identity, pass-through sensor and occluded sensor | regression-covered |
| CCD angular envelope | 120 rad/s, radius 5, 1/60 s at budgets 128 and 10 | publishes 115-sample/0.087-unit target gap and 10-sample/1-unit capped gap |
| Lifecycle | duplicate/cross-world ownership, removal wakeup, cache/event cleanup, step mutation barriers | regression-covered |
| Invalid input | non-finite controls, malformed collider geometry/material/filter/derived kind | rejected before mutation/intake |

The stack's geometric target is a top centre at 11.5. The accepted default regression floor is 11;
the measured result is about 11.11. Raising position iterations from 3 to 8 produces 11.388 and 20
produces 11.438. These are declared qualification scenes, not a promise of arbitrary scale or mass ratio.

The performance reference and exact ceilings are in [performance.md](./performance.md). Terrain uses a
retained, version-invalidated local BVH in `@flighthq/collision`: concave shapes are intentionally absent
from the convex support registry, and physics3d permits them only on static bodies.

## Blocking gate

1. **Platform evidence.** The TypeScript implementation is the executable specification, and
   `@flighthq/physics3d-abi` fixes the persistent handle/buffer boundary. The charter's Rust/WASM
   performance target still has no implementation, parity suite, ownership measurements, or JS/WASM
   crossing budget. Native work remains paused by user direction; do not imply target-wide AAA
   qualification until its differential and performance gates pass.

## Candidate open directions

1. **`applyPhysics3DAngularImpulse`.** A direct angular impulse at the centre of mass, without
   requiring a world-space point. The linear counterpart (`applyPhysics3DLinearImpulse`) exists.
2. **Charter dependency list update.** The charter's `Dependencies` line is stale and should reflect
   the actual runtime set: `collision`, `log`, `math`, `node`, `spatial`, `types`.
3. **Charter North Star cleanup.** The GJK/EPA ownership claim in the North Star predates the decision
   that moved the 3D narrow phase to `@flighthq/collision`. Removing the stale text eliminates a
   self-contradiction.
4. **Active-ragdoll integration.** Skeleton-body binding, pose drive, and animation/physics mode
   transitions via a proposed `@flighthq/ragdoll3d` package. If the controller proves it needs a
   general target-orientation motor, that primitive belongs here.

## Qualification rule

The TypeScript target may be called AAA-qualified against the declared scenes above. Do not replace the
package-wide verdict with unqualified "AAA-complete" until the native blocking gate either passes a
checked-in, repeatable threshold or is explicitly removed from the charter by user direction. New claims
belong in this table with the scene, duration, configuration, metric, and bound that make them falsifiable.
