---
package: '@flighthq/skeleton3d'
status: solid
score: 72
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/skeleton3d

## Verdict

**solid — 72/100.** The package has moved well past the old palette-only `skeleton` review. The live source owns the `Skeleton3D` entity, joint palette computation, CPU vertex skinning, mesh-level bind-pose deformation/update, and skinned bounds. The charter records GL GPU skinning plus MD5/glTF/AWD influence import through a shared top-four/renormalize seam. These are useful bedrock primitives rather than a controller kitchen sink.

It is not yet an authoritative skeletal-animation domain. WGPU deformation still lacks host-GPU proof; the chosen top-four packing drops additional influences rather than representing them; morph targets, pose buffers/masks, IK/constraints, dual-quaternion skinning, and retargeting remain absent; and no functional raster establishes CPU↔GL deformation parity, animated bounds/culling, or imported-asset behavior.

## Present capabilities

- `createSkeleton3D` and palette/bind-pose operations over explicit joint matrices.
- Allocation-explicit CPU `skinVertices` plus `skinMeshGeometry`/`updateMeshSkin` composition.
- Skinned bounds through `getMeshSkinBounds`.
- Layout-driven skin participation through `Mesh.skin`, avoiding a duplicate `SkinnedMesh` node family.
- Shared importer packing for MD5, glTF, and AWD, with top-four influence selection and renormalization.
- GL shader-variant plumbing recorded in the charter; WGPU remains deferred.

## Gaps

- No behavior-level GL capture proving imported animation deforms the intended vertices, matches the CPU reference, or updates culling bounds.
- More than four influences are discarded to the top four; no secondary/variable influence representation exists.
- Morph-target data and skin/morph execution order are absent.
- Pose buffers, joint masks, and blend-tree consumption are not yet composed with `@flighthq/animation`.
- IK/aim/constraints, dual-quaternion skinning, and retargeting are absent.
- WGPU skinning and cross-backend functional parity remain unproven.

## Contract fit

The package boundary is sound: deformation math lives here; animation sampling/mixing stays in `animation`; mesh stores layout/source data; backends consume the palette explicitly. New depth should preserve that split and add small solver/deformation primitives rather than a stateful all-in-one skeleton controller.
