---
package: '@flighthq/skeleton3d'
crate: flighthq-skeleton3d
draft: false
lastDirection: 2026-07-15
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# skeleton3d — Charter

Renamed from `@flighthq/skeleton` (2026-07-15). The original charter, review, assessment, and status remain in `agents/packages/skeleton/` until the code-level rename is executed; this cell is the forward reference.

## What it is

3D skeletal animation: joint hierarchies with 4×4 matrix transforms, inverse-bind matrices, skin-palette computation for GPU upload, blend trees, and 3D IK constraints. The domain Mixamo, Unity Mecanim, and Unreal's Animation Blueprint occupy — skeletal character animation for 3D games and applications.

This is the 3D half of skeletal animation. 2D skeletal animation is `@flighthq/skeleton2d` (bone hierarchies with 2D affine transforms, CPU mesh deformation, slot-based draw order, 2D IK). The split exists because the dimension changes the mathematical model: 3D uses Matrix4/quaternion joint transforms and GPU skin-palette upload; 2D uses affine bone transforms and CPU vertex warping. Different implementations, same vocabulary.

## North star

- Complete 3D skeletal animation pipeline. Joints, skins, morph targets, blend trees, constraints.
- Skin palette computation is a pure CPU operation with explicit out-parameter allocation.
- The package owns the bone/joint data model; animation playback and GPU skinning live elsewhere.

## Boundaries

- In scope: Skeleton entity, joint matrices, bind pose, SkinnedMesh node type, morph targets/blend shapes, IK constraints (long-term).
- Non-goals: animation playback (that's `animation`), GPU skinning shaders (`scene-gl`/`scene-wgpu`), 2D skeletal animation (`skeleton2d`).

## Decisions

All decisions from the original `skeleton` charter apply. See `agents/packages/skeleton/charter.md` for the full history.

- **[2026-07-15] Rename from `skeleton` to `skeleton3d`.** Both 2D and 3D skeletal animation packages get explicit dimension suffixes for symmetry: `skeleton2d` and `skeleton3d`. User-directed.

## Open directions

Inherited from the original `skeleton` charter:

- SkinnedMesh node type design: how does it compose with scene's hierarchy nodes?
- Morph target data model: per-target attribute deltas vs interleaved blend shapes.
- IK solver scope: CCD, FABRIK, or analytical two-bone? All three?
