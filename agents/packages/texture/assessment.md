---
package: '@flighthq/texture'
updated: 2026-07-21
basedOn: ./review.md
---

# texture — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Separate desired mip policy from effective per-state residency.** `Sampler.mipmaps` currently means
   "generate/use a full chain" and the GL binder generates it on first use; it cannot request a mip
   range, upload one level progressively, report resident bytes, or distinguish requested quality from
   what one render state actually holds. Texture/ImageResource descriptors carry source intent and
   versions; each backend runtime owns effective resident levels. Expose small level/range/byte queries
   and upload/evict operations rather than an implicit global streamer.
2. **Keep scheduling caller-owned.** `assets` or a dedicated scheduler owns budgets, visibility
   priority, cancellation, and eviction order. `texture` supplies descriptors and residency operations;
   `render-gl` realizes them. Do not put a global cache, loader, or policy loop in the Texture entity.
3. **Complete declared channel/format paths with render proof.** Compressed upload already accepts full
   containers, but it is not integrated with progressive ImageResource residency. The low-level GL
   uploader truthfully realizes caller-bound 2D, cubemap, and 2D-array containers; the universal
   `Texture`/`ImageResource` binder remains deliberately 2D and no entity/material sampling path exists
   for arrays, volumes, or a compressed cubemap as one container. Add those subject-level descriptors
   and binders rather than making the 2D bridge guess a target. Cube color-space behavior, all declared
   pixel formats, and map-specific UV0/UV1 selection likewise need behavioral functionals before
   descriptor presence counts as feature depth.

## Recommended

None. The review's compile blocker and dependency cleanup are already resolved; the remaining work is
the cross-package residency/realization depth above.

## Approved

- [2026-07-22 · reconciled] All six canonical `CubeFace*` indices live beside `CubeTexture` in
  `@flighthq/types`, are barrel-exported, and are consumed by texture tests. The stale
  `@flighthq/resources` dependency is absent; `texture` depends only on entity, geometry, and types.

## Backlog

- Texture-array/3D volume kind.
- Format/usage/mip policy.
