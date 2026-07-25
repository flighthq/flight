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
- Lifecycle `create*`/`clone*`/`dispose*`/`equals*`/`validate*` + sentinel lookups `getSkeleton2DBoneIndexByName` (−1) / `getSkeleton2DBoneWorldMatrix` (false). `cloneSkeleton2D` IS the independent-pose clone (bones are deep-copied plain data — no separate `cloneBoneHierarchy` atom, unlike skeleton3d's shared SceneNodes).

## Deferred (per charter phasing)

- **P2:** 2D IK (two-bone analytical + CCD chain), transform constraints, path constraints (over `@flighthq/path`). Additional attachment variants (bounding box, path, clipping, point) as open-family members.
- **P3:** skin sets (named slot→attachment collections for character customization), animation timelines (curve interpolation, played by `@flighthq/animation`).
- **Neighbor (not started):** `skeleton2d-formats` (Spine/DragonBones import) — do not start until chartered.
