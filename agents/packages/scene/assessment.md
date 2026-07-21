---
package: '@flighthq/scene'
updated: 2026-07-21
basedOn: ./review.md
---

# scene — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Reconcile orphaned scene-node families.** `InstancedMesh`, `LodMesh`, `Billboard`, and related header types either gain constructors/updates/query behavior and backend consumers or are removed; a type-only promise is not a realized feature.
2. **Make the cull/prepare seam singular and consumed.** Scene's cull query and render's internal visible-mesh walk should share one explicit result/primitive or one should be removed. Instancing, LOD, layers, skinned bounds, and shadow-caster collection must enter through the chosen seam.
3. **Defer acceleration until the semantic list is correct.** BVH/octree, occlusion, and other acceleration are valuable later, but first establish correct visibility/layer/instancing/LOD/skinning behavior and functional evidence on the simple walk.

## Recommended

1. Remove dead no-op ternaries in raycaster.
2. Replace literal casts with `createVector3` in raycast hit construction.

## Approved

None.

## Backlog

- BVH/octree spatial acceleration.
- Per-node visibility/layer mask.
- Serialization.
