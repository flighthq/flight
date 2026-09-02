---
package: '@flighthq/skeleton2d'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - source
  - tests
  - types
  - package.json
  - charter
  - status
  - rig-model
---

# skeleton2d — Review

**Domain:** 2D skeletal animation — bone hierarchies with affine transforms, weighted CPU mesh
deformation, slot-based draw order, constraint solvers (IK, transform, path), animation channel
binding, and named skin sets. The Spine/DragonBones runtime model.

## Verdict

Substantially complete against its charter's phased plan. P1 (bone tree, world propagation, all five
inherit modes, bind pose, weighted deform, slots and the full attachment set) and P2 (IK, transform,
and path constraint solvers as an opt-in registry) are built and tested. Skin sets, the animation
target binder registry, draw-order channels, and the guard/explain diagnostic seam are all present.
The implementation quality is high: allocation-free hot paths, principled Readonly usage,
independently derived test assertions (tip positions from hand-computed triangles rather than solver
output), and thorough documentation of architectural rules in the rig-model doc with machine-
checkable invariants.

The score reflects what is built against the charter's full scope. The deferred items (longer IK
chains, transform constraint local/relative modes, Spine softness, the event model, swap-vs-skin
composition) are all named deferrals with architectural justification, not oversights. What is
present works correctly and satisfies SDK conventions to a degree that few other packages match at
this stage.

## Present capabilities

**Bone tree and world propagation.** Flat parent-before-child bone array with per-bone local setup
transforms (x, y, rotation degrees, scaleX, scaleY, shearX, shearY). Single-pass
`computeSkeleton2DWorldTransforms` writes flat 2x3 affine matrices (6 floats per bone) into a
pre-allocated `Float32Array`. All five Spine inherit modes implemented as four independent boolean
axes (`TransformInherit2D`: rotation, scale, reflection, translation) with named presets
(`TransformMode2D`). The per-bone `computeSkeleton2DBoneWorldTransform` primitive is exported for
constraint solvers to refresh individual bones without re-walking the skeleton.

**Bind pose and bone matrix palette.** `setSkeleton2DBindPose` captures inverse world matrices.
`computeSkeleton2DBoneMatrices` produces the skin palette `world * inverseBind` for weighted vertex
deformation. Degenerate (zero-scale) bones produce identity inverse-bind rather than NaN.

**Weighted CPU mesh deformation.** The `skinSkeleton2DAttachmentPoints` primitive is shared by all
deformable attachment types (mesh, path, bounding box, clipping, point). Weighted mode reads the
`Skin2D` influence stream; rigid mode transforms by a single bone's world matrix. Deform offsets
(animated vertex displacements) are applied in bone-local space before the weighted sum, addressed
per-influence for weighted and per-vertex for rigid — the addressing rule documented in rig-model
section 2. Length mismatches are rejected exactly (`===`) and reported through the guard seam.

**Full attachment set.** Six attachment kinds: region (4-corner quad via local matrix composition),
mesh (skinned via `skinSkeleton2DAttachmentPoints`), path (deformed into a `Path` type for curve
query), bounding box (hit-test polygon), clipping (polygon + slot range), point (position + world
rotation for spawn/socket points). Each has its own exported function with the full unabbreviated
type name.

**Slot-based draw order.** `Slot2D` carries `boneIndex`, `attachment`, `color` (packed RGBA), and
`deform`. Slot array position is draw order. `getSkeleton2DSlotDeformOffsets` implements the pull-seam
identity check against the attachment the offsets were authored for, preventing stale offsets from
deforming a swapped attachment.

**Constraint solver registry.** `registerSkeleton2DConstraintSolver` is an opt-in registry keyed by
`Skeleton2DConstraintKind` (string). Three built-in solvers, each behind its own registrar:
- **IK** (`registerSkeleton2DIkConstraintSolver`): one-bone aim and two-bone elbow/knee with mix,
  stretch, compress, and bendPositive. Law-of-cosines analytical solution with dead-zone clamp
  handling.
- **Transform** (`registerSkeleton2DTransformConstraintSolver`): world-space copy of rotation,
  scale, shear, and translation with per-channel mix and offsets.
- **Path** (`registerSkeleton2DPathConstraintSolver`): positions bone chains along a deformed
  `PathAttachment2D` with tangent or chain rotation modes, fixed/percent/length spacing.

Solvers write bone locals and refresh world matrices of moved bones; the caller re-runs
`computeSkeleton2DWorldTransforms` once after the full pass. A constraint whose kind has no
registered solver is skipped (sentinel, not throw).

**Animation target binder registry.** Kind-dispatched registry
(`registerSkeleton2DAnimationTargetBinder`) with bone and slot binders pre-entered (the package's
foundational families) and deform and draw-order binders registering explicitly (opt-in, tree-
shakeable). `applyAnimationClipToSkeleton2D` composes channel deltas onto a setup skeleton clone —
translate/rotate/shear add, scale multiplies — matching Spine's timeline semantics. The setup===pose
aliasing trap is caught with an explicit throw (documented exception to the sentinel rule).

Bone channels cover all ten paths: paired Translation/Rotation/Scale/Shear plus per-axis
TranslationX/Y, ScaleX/Y, ShearX/Y. Slot channels handle Color (packed RGBA, clamped 0..1 to bytes)
and Attachment (step-walked index into a table, with coercion guard). Draw-order channels rebuild a
`NodeOrderList` per keyframe.

**Named skins (wardrobe).** `getSkeleton2DSkin` and `setSkeleton2DSkin` implement the Spine skin-set
model. `setSkeleton2DSkin` writes each skin entry's attachment onto its named slot, leaving
unmentioned slots untouched (overlay semantics for layered skins).

**Entity lifecycle.** `createSkeleton2D`, `cloneSkeleton2D` (deep-copies bones and buffers, shares
slot attachments), `disposeSkeleton2D` (clears references for GC), `equalsSkeleton2D` (bone-by-bone
field comparison including transformMode axes). `validateSkeleton2D` checks parent-before-child
ordering and buffer sizing.

**Diagnostics.** Guard seam with `reportSkeleton2DDeformLengthMismatch` and
`reportSkeleton2DCoercedInterpolation`; the slots are null until `enableSkeleton2DGuards` installs
log-backed guards. Paired explain queries: `explainSkeleton2DDeformLength` (why a deform was
accepted/rejected, as plain data) and `explainSkeleton2DChannelInterpolation` (whether a channel
will be coerced to step). `isSkeleton2DSteppedChannelSubject` is a pure query for pre-validation.

**Export lane discipline.** 35 functions on the public `.` lane; 56 total on `./contract`. The
contract-only surface includes solver internals (`solveSkeleton2DIkConstraint`), guard plumbing
(`setSkeleton2DCoercedInterpolationGuard`), the draw-order channel builder, and the skin functions.
The split is intentional and well-reasoned.

**Test depth.** 21 source modules, 21 colocated test files — perfect 1:1. ~3,600 lines of tests
against ~2,000 lines of non-test source (1.8:1 ratio). Tests use independently derived ground truth:
IK tests assert tip world position from hand-computed triangle geometry; deform tests assert values
reachable only if offsets are applied before the weighted sum; path constraint tests assert angles
only achievable if chain aiming is genuinely implemented.

## Gaps

**Named deferrals (acknowledged in status.md and charter):**

- **IK covers one- and two-bone chains only.** Longer chains (CCD, FABRIK) need iterative solvers
  and are a different algorithm, not more of the current one. Explicitly deferred in charter P2.
- **Spine IK `softness` is absent.** Named in the `Skeleton2DIkConstraint` type doc as a deliberate
  deferral — carrying a field the solver does not honor is worse than not carrying it.
- **Transform constraint is world-space only.** Spine's `local` and `relative` variants are named in
  both the type doc and status.md as deferred.
- **No event model.** No `Skeleton2DEvent` type exists; `skeleton2d-formats` has nowhere to land
  event streams. Recorded in status.md.
- **Attachment-swap channels do not compose with the wardrobe.** Swap tracks index against the setup
  skin; `setSkeleton2DSkin` does not re-point them. Recorded in status.md as a deferred fix.

**Observed in source review (not recorded as deferrals):**

- **`explainSkeleton2DDeformLength` uses `>=` for `accepted` while `skinSkeleton2DAttachmentPoints`
  uses strict `===`.** The explain function reports `accepted: true` for a stream longer than what it
  parallels, but the actual deformer would reject it. The two must agree; the deformer is the
  authority. This is a bug: the explain query gives incorrect guidance.
  (`explainSkeleton2DDeformLength.ts:23` vs `skinAttachment2DPoints.ts:50,86`)
- **`toSkeleton2DParentSpace`, `wrapSkeleton2DAngle`, and `MINIMUM_DETERMINANT` are duplicated
  across three solver files** (ikConstraint2D.ts, transformConstraint2D.ts, pathConstraint2D.ts).
  These are private functions, so the duplication is a tree-shaking trade-off rather than a
  convention violation — extracting them to a shared internal module would couple the solvers and
  prevent a bundle from shedding unused ones. But the trade-off should be stated, because a reader
  seeing the same function three times does not know whether it is intentional.
- **`MATRIX_STRIDE = 6` is repeated in 5 files.** Same tree-shaking trade-off as above, but with a
  constant rather than a function. A single shared constant would not prevent tree-shaking (constants
  are inlined by bundlers), so this one could be extracted without cost.
- **No `resetSkeleton2DToSetup` or equivalent.** Resetting a posed skeleton to its setup state
  requires the caller to manually copy each bone's fields from the setup clone. A convenience
  function would make the setup-pose-is-the-base contract visible as API.
- **`cloneSkeleton2D` does not clone `skins`.** The function's doc says "Slots and their attachments
  are SHARED" — skins are immutable setup data, so sharing is correct. But the clone does not copy
  the `skins` array at all (the field is absent from the `createEntity` call), so a cloned skeleton
  has no `skins` property. A consumer calling `getSkeleton2DSkin` on a clone would get `null`.

## Charter contradictions

None found. Every implementation decision in the source aligns with the charter's stated boundaries,
decisions, and non-goals. The self-contained flat bone array (charter decision 2026-07-25) is
faithfully implemented — `@flighthq/node` is used only by the draw-order target module for its
`NodeOrderList`, not for the bone hierarchy. The deform output as flat interleaved `Float32Array`
matches the charter decision. The phased build plan is accurately reflected in the status log.

The charter's dependency list (`geometry`, `math`, `node`, `types`) is a subset of the actual
dependencies (`animation`, `entity`, `geometry`, `log`, `math`, `node`, `path`, `registry`,
`types`). The additions are all justified by the features they serve (animation binders need
`animation`, guard seam needs `log`, path constraints need `path`, the binder registry uses
`registry`, entity creation uses `entity`). The charter was written before P2 landed, so the
dependency list was accurate at the time. It could be updated.

## Contract and docs fit

**Package.json:**
- `"sideEffects": false` — correct. No top-level side effects; animation binders are lazily
  initialized on first access, not at import time.
- Two export lanes (`.` and `./contract`) — correct per the two-lane convention.
- Dependencies are accurate for what the source imports.
- Description accurately reflects the package's scope.

**Types-first:**
All exported types live in `@flighthq/types`. The implementation package exports functions only — no
exported interfaces, types, or enums in any skeleton2d source file. Verified by grep.

**Import style:**
All type imports use `import type { }` on separate lines. No inline `import { type Foo, bar }`
violations.

**No TODOs or FIXMEs in source.** All open work is tracked in status.md.

**Naming:**
All exported function names carry the full unabbreviated `Skeleton2D` type name and are globally
self-identifying. Verbs match their semantics: `create*` allocates, `compute*` is a pure query with
out-param, `deform*` writes deformed coordinates, `set*` mutates, `get*` reads, `validate*` returns
a sentinel, `register*`/`unregister*` manage the registry, `enable*`/`disable*` toggle guards,
`explain*` returns plain data, `is*` returns boolean, `find*` returns index or sentinel.

**Angles:**
Bone rotations and shear are degrees in the authoring layer (`Bone2D.rotation`,
`Bone2D.shearX/shearY`), converted to radians via `DEG_TO_RAD` at the seam inside
`computeSkeleton2DBoneWorldTransform`. Point attachment rotation is degrees. IK solver results are
written as degrees to bone locals. Consistent with the project-wide convention.

**Rig-model doc:**
The four rules documented in `rig-model.md` are all verified against the current source:
1. Animation target binders pre-entered, constraint solvers opt-in (verified by grep).
2. Deform addressing uses `===` (verified at `skinAttachment2DPoints.ts:50,86`).
3. No handle concept in `skinAttachment2DPoints` (verified by grep: 0 hits).
4. `@flighthq/path` import only in `pathConstraint2D.ts` (verified by grep).

## Candidate open directions

- **Event model.** A `Skeleton2DEvent` type and an event channel binder would let `skeleton2d-
  formats` land Spine and DragonBones event streams. This is the most immediately needed gap for
  format integration.
- **`resetSkeleton2DToSetup` convenience.** A single function that copies all bone locals from a
  setup skeleton to a pose skeleton, replacing the manual field-by-field copy callers must do today.
- **Longer IK chains.** CCD or FABRIK solvers for chains longer than two bones. These are distinct
  algorithms and could register as additional constraint kinds.
- **Transform constraint local/relative modes.** Spine's `local` and `relative` variants for the
  transform constraint solver.
- **Shared `MATRIX_STRIDE` constant.** A single inlined constant in a small shared internal module,
  since constant inlining by bundlers means no tree-shaking cost.
- **Fix `explainSkeleton2DDeformLength` acceptance criterion.** The `>=` should be `===` to match
  the actual deformer's behavior, or the deformer should accept `>=` and the rig-model doc should be
  updated — but the two must agree.
- **Clone `skins` in `cloneSkeleton2D`.** The `skins` field is currently not copied to the clone,
  so `getSkeleton2DSkin` on a clone returns null.
