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
   containers, but it is not integrated with progressive ImageResource residency. Texture arrays/3D
   volumes, cube color-space behavior, all declared pixel formats, and map-specific UV0/UV1 selection
   need backend consumers and behavioral functionals before descriptor presence counts as feature depth.

## Recommended

1. Define CubeFace constants (`CubeFacePositiveX`, `CubeFaceNegativeX`, `CubeFacePositiveY`, `CubeFaceNegativeY`, `CubeFacePositiveZ`, `CubeFaceNegativeZ`) in `@flighthq/types`.
2. Remove unused `@flighthq/resources` dependency from package.json.

## Approved

None.

## Backlog

- Texture-array/3D volume kind.
- Format/usage/mip policy.
