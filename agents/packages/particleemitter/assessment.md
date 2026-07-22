---
package: '@flighthq/particleemitter'
updated: 2026-07-21
basedOn: ./review.md
---

# particleemitter — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Finish the 3D node and render feed as real composition.** `ParticleEmitter3D` already owns
   scene-node participation, z-aware data/bounds, world/local spawning, and GL/WGPU billboard feeds.
   An allocation-free camera-depth ordering atom now writes caller-owned indices without permuting
   simulation storage; prepared rendering must consume that order and compose it with the scene's
   cross-subject transparent order. Remove the remaining 2D
   force/collision cast rather than treating the current billboard path as the whole 3D domain.
2. **Offer separable render modes.** Billboard, stretched billboard, mesh, ribbon/trail, and point modes register independently per backend so a basic quad emitter does not pull every mode into its bundle.
3. **Prove ordering and spatial behavior with raster functionals.** Cover camera-facing orientation, world/local simulation, depth sorting, bounds/culling, collision-driven spawning, GL↔WGPU parity after the contract settles, and at least one dense capacity/update case.

## Recommended

No sweep-safe items (extraction not yet performed).

## Approved

- [2026-07-22 · completed] `ParticleEmitter3D` capacity is the minimum across every per-particle
  storage lane: IDs, alpha, color, XY/rotation/scale transforms, Z positions, and XYZ velocities.
  Reservation therefore repairs a short lane instead of returning early from unrelated capacity,
  preventing silent out-of-bounds writes after imported or caller-supplied data.
- [2026-07-22 · completed] Back-to-front particle ordering is a separate allocation-free atom over a
  caller-supplied stored-position-to-view matrix, index output, and depth scratch. It preserves
  simulation order, resolves equal depths by source index, and leaves undersized outputs untouched;
  prepared renderer consumption and cross-subject transparent ordering remain open.

## Backlog

- Extract from particles.
