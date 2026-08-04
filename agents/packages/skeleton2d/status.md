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
  (`8d3a79276`), path (uncommitted at time of writing). `solveSkeleton2DConstraints` walks the list in
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

**Path constraints are written but NOT registered pending an acknowledgment** that they stay in this
package rather than a neighbour cell. The code is independent of that decision; only the registrar call
and the `@flighthq/path` manifest edge embody it. See [rig model §4](./rig-model.md) for the measurement.

## Still deferred (per charter phasing)

- **P2 remainder:** attachment variants beyond region/mesh/path — bounding box, clipping, point — as
  open-family members.
- **P3:** skin sets (named slot→attachment collections for character customization).
- **Held for a ruling:** per-axis bone animation paths (`TranslationX`/`ScaleY`/…). Spine's binary format
  already decodes per-axis timelines and `spineBinaryParse.ts` widens each into a two-component track with
  an identity in the untouched axis — correct for one such timeline and **wrong for two**, since both
  channels compose onto setup and the second writes the first axis back. Measured, not inferred: channels
  `[7,0]` and `[0,5]` applied together give `x=0, y=5`.
