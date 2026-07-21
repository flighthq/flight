---
package: '@flighthq/texture'
updated: 2026-07-21
basedOn: ./review.md
---

# texture — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Add explicit mip/residency state to texture realization.** The descriptor layer is strong, but it cannot yet express which mip levels are resident, upload a new level progressively, or report the memory actually held. Keep these as small resource operations rather than an implicit global streamer.
2. **Separate sampling description from residency policy.** Texture continues to own sampling/UV/cubemap/format descriptors; `assets` or a dedicated caller-owned scheduler owns budgets, visibility priority, eviction, and request cancellation.
3. **Complete declared channel/format paths with render proof.** Texture arrays/3D volumes, compressed payload upload, color-space behavior, and map-specific UV selection need backend consumers and functionals before their descriptor presence counts as feature depth.

## Recommended

1. Define CubeFace constants (`CubeFacePositiveX`, `CubeFaceNegativeX`, `CubeFacePositiveY`, `CubeFaceNegativeY`, `CubeFacePositiveZ`, `CubeFaceNegativeZ`) in `@flighthq/types`.
2. Remove unused `@flighthq/resources` dependency from package.json.

## Approved

None.

## Backlog

- Texture-array/3D volume kind.
- Format/usage/mip policy.
