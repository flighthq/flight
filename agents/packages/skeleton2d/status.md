# skeleton2d — Status

Continuity log for `@flighthq/skeleton2d`. See [charter](./charter.md) for the AAA target and the blessed decisions.

## Current state — P1 runtime landed (2026-07-25)

The package exists, is registered (tsconfig paths/build refs, sdk barrel + `scene` group + deps), and passes `packages:check` / `exports:check` / `typecheck`. **23 tests pass.** All types live in `@flighthq/types` (implementation exports functions only).

**Types (P1 header surface):** `TransformMode2D`, `Bone2D`, `Skeleton2D`, `Slot2D`, `Attachment2D` (open base) + `RegionAttachment2D` + `MeshAttachment2D`, `Skin2D` (Spine variable-influence weighted-mesh binding).

**Runtime (P1) — done:**
- `computeSkeleton2DWorldTransforms` — single linear parent-before-child world pass, degrees→radians at the seam, Spine bone matrix (b/c-transposed into Flight's `x'=a·x+c·y` convention, with shear). **All five inherit modes** implemented: Normal, OnlyTranslation, and the three parent-decomposition modes (NoRotationOrReflection = keep parent scale / strip rotation via column lengths; NoScale / NoScaleOrReflection = keep parent orientation / strip scale via normalized columns, the latter also stripping reflection).
- `setSkeleton2DBindPose` (inverse-bind capture, identity fallback on degenerate) + `computeSkeleton2DBoneMatrices` (palette = world × inverseBind).
- `deformSkeleton2DMeshAttachment` — weighted (Σ w·(boneWorld·localOffset), offsets bake the bind → bone world matrices, no palette) + rigid (slot-bone world × local vertices); out-param flat interleaved `Float32Array`, alias-safe.
- `computeSkeleton2DRegionAttachmentVertices` — 4 world corners (BL/TL/TR/BR) of a region rect via boneWorld × regionLocal.
- Lifecycle `create*`/`clone*`/`dispose*`/`equals*`/`validate*` + sentinel lookups `getSkeleton2DBoneIndexByName` (−1) / `getSkeleton2DBoneWorldMatrix` (false). `cloneSkeleton2D` IS the independent-pose clone (bones are deep-copied plain data — no separate `cloneBoneHierarchy` atom, unlike skeleton3d's shared Node3Ds).

## P2 constraints and rigging landed (2026-08-04)

The four rules these landed under are in [rig model](./rig-model.md) — read that before adding a registry,
a deformer, or proposing a package split on bundle-cost grounds.

- **Constraint solvers, as an OPT-IN registered family** keyed by kind: IK (`1030a3635`), transform
  (`8d3a79276`), path (`e2b25b175`). `solveSkeleton2DConstraints` walks the list in
  declared order; each solver writes bone LOCAL transforms and refreshes the bones it moved, and the
  caller re-runs the world pass once afterward. IK covers one-bone aim and two-bone law-of-cosines with
  mix, bend direction, stretch and compress. Named deferrals, deliberately absent from the types rather
  than accepted and ignored: Spine's IK `softness`, the transform constraint's `local`/`relative`
  variants, and chains longer than two bones (a different, iterative algorithm).
- **`PathAttachment2D`** (`0fe76d2d4`) as the third attachment family member beside region and mesh, with
  `deformSkeleton2DPathAttachment` — weighted branch byte-identical to the mesh deformer's, since `Skin2D`
  carries no triangles and no UVs and was already geometry-agnostic.
- **Deform offsets** (`20466a2d5`) on both deformers, as a trailing parameter.
- **Animation channels dispatch on a target kind through a binder registry** (`7f2f72624`), replacing the
  structural `typeof target.boneIndex` probe. Slot colour and attachment swap were already implemented
  before this arc despite the animation-model doc describing them as unbuilt.
- **`computeSkeleton2DBoneWorldTransform`** extracted as the primitive `computeSkeleton2DWorldTransforms`
  is a linear pass over, because a constraint solver needs exactly it.

**Path constraints stay in this package** — ruled on the 2051-vs-2051 measurement in
[rig model §4](./rig-model.md), no neighbour cell. `registerSkeleton2DPathConstraintSolver` is opt-in
exactly like the IK and transform registrars; nothing in the family registers by default.

The **guard module** (`enableSkeleton2DGuards`, `skeleton2dGuards`, `explainSkeleton2DChannel`) was built
by another cell for three callers and reports two coercions: an attachment channel walked as Step against
its stated interpolation, and a deform offset stream too short for the stream it addresses. Both deformers
report the second, naming the attachment kind so a caller can tell which one to fix.

## Per-axis bone animation paths, and the Spine defect they fixed (2026-08-04)

`Skeleton2DAnimationPath` gained `TranslationX`/`TranslationY`, `ScaleX`/`ScaleY` and `ShearX`/`ShearY` —
one-component tracks driving a single field each. The **paired** paths stay, because Spine JSON and
DragonBones do author them paired; both shapes exist because both formats use them.

**They fixed a silent, total loss of one animated axis.** `spineBinaryParse.ts` widened each per-axis
timeline into a two-component track with an identity in the untouched axis. That is correct for one such
timeline and wrong for two: a bone carrying both `translateX` and `translateY` produced two channels on
the same paired path, and since each composes onto the **setup** pose the second wrote the first's axis
back. Measured, not inferred — tracks `[7,0]` and `[0,5]` applied together produced `x=0, y=5`.

They cannot simply be merged into one track either: both formats author the two axes with **independent
keyframe times** and per-segment bezier easing, so resampling onto a common time set changes the curve
rather than densifying it.

`spineParse.ts` (JSON) turned out to have the same gap in a different form — it handled only the four
paired keys, so Spine 4's lowercased `translatex`/`translatey`/`scalex`/`scaley`/`shearx`/`sheary` were
dropped entirely. Silent *absence* rather than silent *overwrite*, which is why it had gone unnoticed.
Both parsers now emit the per-axis paths directly, and the widening and identity-fill code is gone.

Both regression tests were **mutation-tested against the old behaviour** rather than merely passing — see
[rig model §5](./rig-model.md).

## Still deferred (per charter phasing)

- **P2 remainder:** attachment variants beyond region/mesh/path — bounding box, clipping, point — as
  open-family members.
- **P3:** skin sets (named slot→attachment collections for character customization).
