---
package: '@flighthq/particleemitter'
status: solid
score: 74
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/particleemitter

## Verdict

**solid — 74/100.** The status file is stale: extraction is complete, and this is no longer a package awaiting creation. The live source has parallel 2D/3D emitter entities and explicit burst/prewarm/step/update operations. The 3D path carries z position/velocity/gravity, sphere/cone/box spawning, world/local-space motion, conservative 3D bounds, deterministic tests, and scene-node participation. Both scene backends contain instanced camera-facing billboard renderers.

The obvious remaining depth is specific rather than existential. `stepParticleEmitter3D` casts to `ParticleEmitter2D` to reuse 2D force/collision passes, so force/collider behavior is not truly three-dimensional. Rendering is one billboard family; sort-index consumption, stretched/mesh/ribbon/point modes, and behavior-level raster proof are absent. Module-global renderer scratch and duplicated emitter collection should also be revisited when the scene prepare/cull seam settles, but they are backend concerns rather than reasons to bloat this package.

## Present capabilities

- Entity-backed `ParticleEmitter2D` and `ParticleEmitter3D` node/data surfaces.
- Capacity-managed SoA data, append/remove/compact/clone operations, and deterministic simulation tests.
- 3D spawn volumes/directions, z-aware gravity and velocity, world/local-space trail placement, and AABB bounds.
- Explicit burst, update, step, and prewarm calls; no hidden frame loop.
- GL and WGPU instanced billboard consumers reached from the scene draw.

## Gaps

- 3D forces/colliders reuse the 2D pass through an unsafe cast and cannot model volumetric fields or 3D collision normals.
- No distance/sort-index contract reaches the renderers.
- No stretched billboard, mesh, ribbon/trail, or point render mode.
- No raster functional proves camera-facing orientation, depth ordering, world/local behavior, culling, dense updates, or backend parity.
- The package status still claims extraction has not occurred.

## Contract fit

The sim/node split and dimension-explicit type names are sound. Further modes and GPU/compute work should remain opt-in registrants/consumers over explicit buffers; a basic billboard emitter must not import every render mode or a compute backend.
