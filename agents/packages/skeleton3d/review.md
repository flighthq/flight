---
package: '@flighthq/skeleton3d'
status: solid
score: 75
updated: 2026-07-21
ingested:
  - charter.md
  - source
  - tests
  - scene morph source
---

# skeleton3d — Review

## Verdict

**Solid — 75/100.** Skeleton3D owns an Entity, joint hierarchy and palette computation, CPU vertex
skinning, bind-pose capture, mesh update and skinned bounds. GL consumes an explicit palette, and MD5,
glTF, and AWD import feed a shared top-four influence representation. This is a coherent deformation
primitive rather than an animation controller.

The former claim that morph targets are absent is stale. Mesh and scene now carry morph targets,
animation drives their weights, CPU blending exists, and GL has a morph functional. The unresolved
depth is correct **composition**: independent morph and skin paths do not yet establish a safe,
per-frame, clone-safe morph-plus-skin result shared by render, bounds, and picking.

## What is solid

- Explicit skeleton creation, bind/inverse-bind data, joint palette updates, and CPU skin functions.
- Mesh skin participation is a property of Mesh, avoiding a redundant SkinnedMesh node hierarchy.
- Importers normalize onto one top-four layout and GL uses a reusable palette texture rather than one
  resource per skeleton.
- CPU skinned bounds exist, preserving a headless query route.
- Morph is correctly a sibling deformation family in mesh/scene, not falsely owned by skeleton3d.

## Gaps

- More than four influences are discarded rather than represented by an optional secondary/variable
  influence stream.
- CPU morph and skin both write MeshGeometry. The documented ordering does not by itself solve repeated
  frames, independent clones sharing geometry, corrective shapes, or GPU morph-plus-skin composition.
- Picking and culling do not yet consume a guaranteed same-frame prepared deformation result.
- There is no raster/CPU comparison covering imported animation, composed morph+skin, animated bounds,
  and prevention of accidental CPU-plus-GPU double skinning.
- Pose buffers, joint masks, additive/override pose mixing, sockets, and root motion are not composed
  with the target-free animation mixer.
- IK/aim constraints, dual-quaternion skinning, and retargeting remain absent.
- WGPU remains intentionally deferred until GL semantics and evidence settle.

## Boundary conclusion

Keep skeletal palette/deformation math here, morph math in mesh, animation time/mixing in animation,
and scene preparation as the composition point. Do not absorb morph, IK, playback, and render resources
into one Skeleton controller.
