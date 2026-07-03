---
package: '@flighthq/skeleton'
updated: 2026-07-03
basedOn: ./review.md
---

# skeleton — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (stub, 27/100). The palette kernel and the joints-are-`SceneNode`s architecture are right and stay; the review's build-out order (CPU skinning → names/validation → poses/blending → bounds/attachment → IK/DQS) splits cleanly: the buffer-level math and entity hygiene are sweep-safe, while everything touching the mesh vertex layout, the animation mixer boundary, or a charter Open direction is parked.

## Recommended

1. Entity quartet: `cloneSkeleton`, `disposeSkeleton`, `equalsSkeleton` (charter Decision 2026-07-03).
2. CPU linear-blend-skinning kernel — a buffer-level `skinVertices(outPositions, outNormals, positions, normals, joints, weights, jointMatrices)` over plain arrays. Unlocks software rendering, skinned picking, and skinned bounds, and is required for Rust-port conformance fingerprinting (deterministic, GPU-free). The `MeshGeometry`-level wrapper is parked (see Backlog).
3. Joint names on `Skeleton` plus `getSkeletonJointIndexByName` (sentinel `-1`) — the importer/attachment seam; the type currently has no place to put names. Types-first in `@flighthq/types`.
4. `validateSkeleton` — sentinel-returning check that `inverseBindMatrices.length === joints.length × 16`; a mismatch currently reads/writes out of range silently.
5. Make the palette an explicit `out` parameter — `computeSkeletonJointMatrices` and `setSkeletonBindPose` take `Readonly<Skeleton>` yet write its buffers; the out-parameter form fixes the semantics and composes with multi-instance palettes (many palettes, one skeleton). Tighten `joints` to `readonly SceneNode[]` while touching the type.
6. `getSkeletonJointWorldMatrix`-style attachment accessor (prop socketing by joint index/name), once names land.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **`applySkeletonToMeshGeometry`** (skinning wired to mesh geometry). _Parked — depends on `mesh` carrying per-vertex `joints`/`weights` attributes and the SkinnedMesh node design (charter Open direction); cross-package._
- **Skinned bounds (`computeSkeletonBounds`).** _Parked — rides CPU skinning plus skinned-vertex attribute availability in `mesh`._
- **Pose buffer + masked blending** (`copySkeletonPose`/`lerpSkeletonPose`/`blendSkeletonPose`, joint masks). _Parked — design decision / cross-package: the mixer loop may be owned by `@flighthq/animation`'s blending design (the flagged animation/skeleton boundary), even though the joint-mask and pose-buffer types belong here; candidate Open direction for the charter._
- **Morph targets / blend shapes.** _Parked — charter Open direction: per-target attribute deltas vs interleaved blend shapes._
- **IK** (two-bone, aim/look-at). _Parked — charter Open direction: solver scope (CCD, FABRIK, analytical)._
- **Dual-quaternion skinning.** _Parked — a palette-mode sibling to LBS; the mode seam (per-skeleton flag vs parallel functions) should be designed with the GPU-skinning consumers in `scene-gl`/`scene-wgpu`._
- **Retargeting.** _Parked — large scope; part of the authoritative surface but deferrable per the review._
- **`setMatrix4FromArray(out, array, offset)` geometry helper** to replace the per-element scratch copy loop. _Parked — cross-package (new `@flighthq/geometry` export)._
- **2D skeletal (Spine-style attachments/constraints).** _Parked — design decision / cross-package; candidate Open direction for the charter._

## Approved

None.
