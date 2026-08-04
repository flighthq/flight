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

## The attachment family completed (2026-08-04)

Bounding box, clipping and point join region, mesh and path, closing the P2 attachment set.

- **`BoundingBoxAttachment2D`** — a skinnable polygon that is queried, never drawn. It carries no UVs, no
  triangles and no colour, and that absence is the type: a hit box bound to the same bones as the art it
  covers tracks that art exactly, where a static rectangle drifts as the rig moves.
- **`ClippingAttachment2D`** — geometrically identical to a bounding box; what makes it a distinct type is
  `endSlotIndex`. It clips a **range of the draw order** rather than a subtree, which is why it cannot be
  a `ClipRegion` on one node. `getSkeleton2DClippingAttachmentSlotRange` owns the inclusive-to-half-open
  conversion so no consumer re-derives that off-by-one from prose.
- **`PointAttachment2D`** — a position and a direction, deliberately **not** skinnable: a point rides one
  bone by definition, and anything wanting a blended position wants a weighted attachment.
  `computeSkeleton2DPointAttachmentRotation` derives the angle from the bone's transformed **x axis**
  rather than by adding its world rotation, because those differ under non-uniform scale or shear — the
  axis is where the bone actually points.

**One skinning primitive now serves all four deformable attachments.** `skinSkeleton2DAttachmentPoints`
holds the weighted and rigid branches, the deform addressing rule and the guard report; mesh, path,
bounding box and clipping are each a few lines of delegation. That is the decomposition the complexity
rule asks for — the primitive was already sitting inside the mesh deformer, duplicated once for paths and
about to be duplicated twice more. Breaking one line of it turns **8** tests red across four callers.

## Slot deform, and the false claim that shaped it (2026-08-04)

`Slot2D.deform` carries a **`Skeleton2DSlotDeform` record** — the offsets *and* the attachment they were
authored for — read through `getSkeleton2DSlotDeformOffsets`, which returns them only when that attachment
is the one the slot currently shows. `Skeleton2DDeformAnimationTarget` binds a deform channel through the
existing target registry (opt-in via `registerSkeleton2DDeformAnimationTarget`); the track is an ordinary
numeric one whose `components` is the whole stream, so `@flighthq/animation` needed no widening, and the
offsets **interpolate** — a morph that snapped between drawn keys would be the bug.

**It is a record rather than a bare `Float32Array` because the bare version was unsafe**, and the reasoning
is worth keeping because it was found the hard way. The original seam analysis asserted that a slot-held
buffer "composes correctly with the attachment-swap track — swap the attachment, the deform buffer for the
old one stops being addressed." **That claim was never tested and it is false.**
`bindSkeleton2DSlotAttachment` writes `slot.attachment` and nothing else, so a bare buffer survives a swap
and deforms the new art.

The length check could not have covered it. Of the three ways a swap changes size, only one was detectable:

| Swap to | Old `>=` guard | Now |
| --- | --- | --- |
| a **larger** attachment | caught — buffer too short | caught |
| an **equal** attachment | **silent** | caught by identity |
| a **smaller** attachment | **silent** — longer buffer satisfies `>=` | caught by identity |

Equal is the common case, because matching point counts are what make a swap look continuous — so the
failure was likeliest exactly where the feature is most used.

The record is the [invalidation doctrine](../../conventions/invalidation.md) applied literally: identities
are compared, re-read at a pull seam, with bare assignment as the API. The bare buffer was the shape that
*violated* it, by making a reference-shaped dependency invisible and then trying to catch the consequence
with a length heuristic. **Staleness is now unrepresentable rather than guarded against.**

Separately and independently, the two length guards were changed from `>=` to `===` (`fe25ec3da`). They
remain the only protection against a genuinely mis-sized *authored* buffer, and `>=` accepted an over-long
one silently there too. A caller with one oversized scratch buffer passes `subarray(0, n)`.

## Still deferred (per charter phasing)

- **P2 remainder:** none. The attachment family is complete.
- **P3:** skin sets (named slot→attachment collections for character customization).
