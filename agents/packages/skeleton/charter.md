---
package: "@flighthq/skeleton"
draft: false
lastDirection: 2026-07-03
crate: "flighthq-skeleton"
absorbed: "@flighthq/skeleton3d"
---

# skeleton — Charter

## What it is

Historical skeletal-animation direction now implemented by `@flighthq/skeleton3d`: joint hierarchies, inverse-bind matrices, and skin-palette computation for GPU upload. This cell remains as direction history and must not recreate a generic `@flighthq/skeleton` package.

## North star

- Complete skeletal animation pipeline. Joints, skins, morph targets, constraints.
- Skin palette computation is a pure CPU operation with explicit out-parameter allocation.
- The package owns the bone/joint data model; animation playback and GPU skinning live elsewhere.

## Boundaries

- In scope: Skeleton entity, joint matrices, bind pose, SkinnedMesh node type, morph targets/blend shapes, IK constraints (long-term).
- Non-goals: animation playback (that's animation), GPU skinning shaders (scene-gl/scene-wgpu).

## Decisions

- **[2026-07-15] Absorbed into `@flighthq/skeleton3d`.** The explicit dimension suffix distinguishes this matrix/quaternion/GPU-palette domain from `@flighthq/skeleton2d`. This cell remains historical and must not cause `@flighthq/skeleton` to be recreated.

- **2026-07-03 — Keep as standalone package.** Why: skeletal animation has significant room to grow (SkinnedMesh, morph targets, IK); bundling it into scene would bloat the scene graph with domain-specific state.
- **2026-07-03 — Add clone/dispose/equals for Skeleton entity.** Why: standard entity quartet pattern; Skeleton is a first-class entity that needs lifecycle and comparison support.
- **2026-07-03 — TS-leads, Rust conforms later.** Why: standard project posture.
- **[2026-07-15] Rename to `@flighthq/skeleton3d`.** The 3D skeletal animation package renames from `skeleton` to `skeleton3d` for symmetry with `skeleton2d`. The dimension changes the mathematical model: 3D uses Matrix4/quaternion joint transforms, GPU skin palettes, and 3D IK; 2D uses affine bone transforms, CPU mesh deformation, and 2D IK. Different implementations, same vocabulary. Both packages get explicit dimension suffixes. User-directed.

## Open directions

- SkinnedMesh node type design: how does it compose with scene's hierarchy nodes?
- Morph target data model: per-target attribute deltas vs interleaved blend shapes.
- IK solver scope: CCD, FABRIK, or analytical two-bone? All three?
