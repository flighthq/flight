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

1. **Realize InstancedMesh end to end.** Constructor/data updates, per-instance transforms and optional
   colors, bounds/culling, GL draw, instance identity in picking, and functional evidence must share one
   explicit instance-data primitive.
2. **Realize LodMesh end to end.** Selection and hysteresis should consume camera projection plus the
   active Viewport, integrate resource availability, and expose the selected level to render and picking.
3. **Unify explicit scene preparation.** Morph, skin, billboards, LOD, instances, bounds, culling,
   shadows, and picking must observe one prepared frame without hidden automatic updates or duplicated
   traversal.
4. **Resolve shared-geometry deformation ownership.** Independent clones must not overwrite one
   another's morphed/skinned vertices; keep rigid geometry sharing cheap while making deform state
   per-instance or GPU-resolved.
5. **Add acceleration after semantic correctness.** BVH/octree, occlusion, and other structures should
   consume the same prepared bounds/identity contract rather than create a second scene truth.

## Backlog

- Per-node layers/visibility categories.
- Versioned scene serialization.
- Optional CameraNode/LightNode conveniences only if they remain additive.

## Approved

None.
