---
package: '@flighthq/scene'
updated: 2026-07-21
basedOn: ./review.md
---

# scene — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

No sweep-safe items from this review. The remaining work crosses render, picking, mesh deformation, or
resource-policy seams.

## Depth gaps

1. **Realize InstancedMesh around one versioned data entity.** The current header's `Matrix4[]` plus
   `instanceCount` has no capacity/version/ownership contract and encourages per-instance object churn.
   Introduce one separately constructed instance-data entity with contiguous matrices, optional packed
   colors and stable identity; independent set/count/capacity operations feed bounds, GL upload/draw,
   and picking. `createInstancedMesh` remains a scene-node constructor over geometry/materials + that
   entity, not a hidden allocator or registry.
2. **Replace single-node LOD state with per-view selection.** `activeLevelIndex` on `LodMesh` cannot be
   authoritative when one node renders into two differently sized viewports. A pure selection atom
   consumes camera projection, device-pixel Viewport, world bounds, previous per-view choice,
   hysteresis, and level readiness; preparation records the chosen level without mutating authored
   node state. Replace distance-only thresholds with projected coverage/error (with an explicit
   orthographic rule), and clarify that a level's Mesh contributes render payload rather than a second
   unparented scene transform.
3. **Unify explicit scene preparation around draw entries, not `Mesh[]`.** The current
   `SceneRenderList.visibleMeshes` cannot truthfully carry an instance-data handle/count, chosen LOD +
   level identity, billboard-facing transform, or a per-view choice. Define a small cross-backend
   prepared draw entry and keep its pooled mutable records private to RenderState runtime. Morph, skin,
   billboards, LOD, instances, bounds, culling, shadows, and picking then observe one prepared frame
   without hidden automatic updates or duplicated traversal.
4. **Resolve shared-geometry deformation ownership.** Independent clones must not overwrite one
   another's morphed/skinned vertices; keep rigid geometry sharing cheap while making deform state
   per-instance or GPU-resolved. CPU morph-plus-skin ordering is now one explicit composition and
   changing morph weights correctly refresh skin input. CPU-deformed clones now restore a fresh
   geometry/runtime from captured base state and copy live morph weights while rigid clones retain
   cheap geometry sharing; independently cloned skin joint hierarchies and the prepared GPU contract
   remain open.
5. **Add acceleration after semantic correctness.** BVH/octree, occlusion, and other structures should
   consume the same prepared bounds/identity contract rather than create a second scene truth.

## Backlog

- Per-node layers/visibility categories.
- Versioned scene serialization.
- Optional CameraNode/LightNode conveniences only if they remain additive.

## Approved

- [2026-07-21 · completed] `cloneMesh` preserves cheap rigid sharing but detaches CPU-deformed
  geometry/runtime and mutable morph weights. The deformation clone primitive restores morph base in
  preference to skin base, works even after the source has deformed, recomputes bounds, and carries no
  captured runtime scratch into the clone.
