# Physics3D Solver Abstraction — sequential impulses without barring XPBD

**Status: RATIFIED 2026-08-20 by the user.** The ruling is recorded in the
[physics3d charter](packages/physics3d/charter.md) Decisions; this note is the reasoning behind it.

Read before writing any `@flighthq/physics3d` solver code, and before copying `@flighthq/physics2d`'s
type shapes into 3D. This resolves Open direction 1 in the
[physics3d charter](packages/physics3d/charter.md) (sequential impulses vs XPBD).

## The direction as received

> Build Physics3D around a general rigid-body/contact/constraint model, with the solver behind an
> abstraction. Start with sequential impulses as the rigid-body solver, but avoid architectural
> assumptions that prevent adding XPBD or other constraint solvers later.

Two words in that need pinning down before a builder reads them, because the obvious readings of both
are wrong: **"abstraction"** and **"general."**

## What in physics2d is actually solver-specific

Verified against source, not against the charter. This is the surface that would carry the SI choice
into 3D if copied unchanged.

| Thing | Where | Why XPBD cannot use it |
| --- | --- | --- |
| `normalMass`, `tangentMass`, `bias` on the contact point | `types/src/Physics2D.ts:176-180` | Effective-mass denominators and a restitution velocity bias are SI constructs. XPBD carries compliance and an accumulated Lagrange multiplier instead. |
| `velocityIterations`, `positionIterations`, `penetrationSlop`, `positionCorrection`, `warmStarting` | `Physics2DSolverConfig` | Every knob is SI vocabulary. XPBD's are substep count and per-constraint compliance. |
| **`solve(world, joint)` takes no `dt`** | `types/src/Physics2D.ts:609-611` | The signature is velocity-level by construction. `prepare` receives `dt`; `solve` does not. A positional solver's multiplier update needs it, so no such solver can ever register behind this interface. |
| Step orchestration: integrate once, then N velocity iterations, then M position iterations | `physics2d/src/step.ts` | XPBD inverts the nesting — substeps are the outer loop, each predicting, projecting, and deriving velocity. The only substepping present is CCD conservative advancement (`step.ts:805-811`), not solver substepping. |

Everything else transfers unchanged: `featureId` warm-start matching, islands and sleeping, broadphase
synchronization, contact building, material mixing, CCD, and body pose plus velocity state. XPBD adds
a previous-position per body, which is purely additive.

**The lock-in is narrower than "the solver."** Three data-model decisions and one loop shape.

## The trap in "behind an abstraction"

The tempting reading is a `Physics3DSolverBackend` interface with `prepare` / `solve` / `integrate`
members, swapped like `SpatialIndexBackend`. **It would not work, and it would cost.**

It would not work because SI and XPBD differ in **loop nesting**, not in the body of a per-constraint
method. No amount of swapping a `solve` implementation turns an outer iteration loop into an outer
substep loop. The seam would sit at the one place the two designs agree and miss the place they differ.

It would cost because it is a speculative abstraction with exactly one implementation, which the repo
warns against directly — *"prefer small functions over large abstractions"*, and *"if adding something
forces a user to pull in unrelated weight, the boundary is wrong or the abstraction is premature."*

## What satisfies the direction instead

The obligation is a **partitioning discipline on the data model**, not an interface. Four items, each
cheap now and unrecoverable later:

1. **Solver accumulators live in solver-owned storage, not on the shared contact type.** Geometry and
   identity — position, `depth`, `featureId`, lever arms — belong on the common contact point. SI's
   `normalMass`, `tangentMass`, `bias`, and impulse cache do not. This is the Entity/Runtime rule the
   repo already mandates: *"subsystems attach their own state to the runtime object rather than adding
   fields to the entity."* **`physics2d` broke this rule** by inlining SI fields into
   `Physics2DContactPoint`; 3D should not inherit the mistake.
2. **Joint `solve` takes `dt`.** One parameter. Free now, and otherwise a breaking change to every
   registered solver later.
3. **`substeps` exists in the config from the first release, defaulting to 1**, and `stepPhysics3D`
   ships as a visible sequence over separately exported functions rather than a monolith. Retrofitting
   an outer substep loop is the change that breaks everything downstream. `physics2d` already exports
   its pipeline this way — `warmStartPhysics2DContacts`, `solvePhysics2DContactsOnce`,
   `preparePhysics2DConstraints`, `applyPhysics2DImpulse` — and that decomposition **is** the
   house-style abstraction: *"users and agents can choose the layer they need."*
4. **No single flat `Physics3DSolverConfig` carrying SI-only fields.** A flat struct means adding a
   second solver brings either dead fields or a breaking change. Either kind-tag the config behind the
   registry pattern, or name the type for the solver it configures.

None of this is a solver framework, and none of it adds bundle weight. Item 2 is one parameter; item 1
is a pattern the repo already requires; items 3 and 4 are a defaulted field and a naming call.

## The pushback: "general … contact/constraint model"

**Contacts and joints should stay separate solve paths.** Unifying them under one constraint
abstraction is a recognized over-generalization — Box2D, Bullet, and Jolt all keep them apart, because
contacts are per-step, unilateral, and *generated*, while joints are persistent, mostly bilateral, and
*authored*. `physics2d` correctly keeps `solvePhysics2DContactsOnce` and `solvePhysics2DJointsOnce`
distinct.

So *general* should be read as **shared body state and shared vocabulary**, not **one unified
constraint solve**. This needs to be written down, because the other reading is the natural one for a
builder given the direction verbatim, and it is the expensive one to undo.

## What carries over unchanged

The joint solver registry is already the right shape and should be copied nearly verbatim: an open
`Map<kind, solver>` with `registerPhysics2DJointSolver`, per-kind optional hooks (`swapEnds`,
`warmStart`, `scaleAccumulatedImpulses`, `clearAccumulatedImpulses`), and `usesBodyA` /
`keepsBodiesAwake` participation flags. It is genuinely open, string-keyed, and vendor-extensible —
the registry doctrine applied correctly. Only the `solve` signature changes, per item 2.

## Recommendation

Adopt as written below. The one item worth deciding deliberately rather than by default is item 1: it
implies **not** copying `Physics2DContactPoint`'s field list, which is the path of least resistance
for a builder starting from the 2D package and the single most likely way this ruling gets quietly
violated.

## Proposed charter decision

To append to `agents/packages/physics3d/charter.md` under Decisions if ruled, replacing Open
direction 1:

> **[2026-08-20] Sequential impulses first, with no structural bar to another solver.** The
> rigid-body solver is sequential impulses. The data model must not encode that choice:
> solver-specific accumulators (effective masses, velocity bias, impulse caches) live in solver-owned
> storage rather than on the shared contact type; joint `solve` takes `dt`; `substeps` exists in the
> config from the first release, defaulting to 1; and the step ships as a composition of separately
> exported functions rather than a monolith. This is a **partitioning obligation on the data model,
> not a `SolverBackend` interface** — SI and XPBD differ in loop nesting rather than in the body of a
> per-constraint method, so a method-level seam would sit where they agree and miss where they differ,
> while costing a speculative abstraction with one implementation. "General rigid-body/contact/
> constraint model" means shared body state and shared vocabulary; contacts and joints remain separate
> solve paths, as they are in `physics2d` and in every engine of reference. Relayed from the user.

## What is not proposed

- **No XPBD implementation.** Whether a second solver is ever built is deliberately left open; this
  ruling only ensures it stays possible.
- **No change to `physics2d`.** Its `Physics2DContactPoint` inlining is identified here as the pattern
  3D should not copy, not as a defect to fix in the 2D package. Changing it would be a separate call
  against a shipped, working solver.
- **No decision on the joint set.** The charter's ball-socket / hinge / slider / fixed / cone-twist /
  6-DOF list is untouched.
