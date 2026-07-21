---
package: '@flighthq/scene-gl'
status: solid
score: 75
updated: 2026-07-21
ingested:
  - charter.md
  - source
  - tests
  - functional scenes
---

# scene-gl — Review

## Verdict

**Solid — 75/100.** Scene-gl is now a substantial forward renderer: explicit material registration,
standard/classic/debug/shaded families, multi-light packing, two-pass transparency, shadows, environment
skybox and IBL bake, GPU skinning, CPU-morph upload, particles, custom shaders, color-space/custom-shader
guards, and a common present assembly. The runtime is correctly state-owned rather than module-global.

The main architectural debt is that recent depth arrived as parallel one-off paths. Old PBR extension
materials are separate material kinds rather than composable extension descriptors; environment and
fullscreen caches have incomplete invalidation/destruction; morph, skin, particles, and transparency do
not yet share one prepared-frame/order contract; and HDR output lacks an explicit display transform.

## What is solid

- Mesh material resolution is an open per-state kind registry with sentinel-on-missing behavior.
- Standard PBR and classic Lambert/Phong/Blinn-Phong are distinct, understandable material families.
- Draw partitions opaque/masked and blended subsets, batches contiguous renderer/material runs, computes
  normal matrices per draw, and keeps runtime lists/caches isolated per RenderState.
- Directional shadows, source cubemap upload, skybox drawing, split-sum IBL bake, and PBR IBL consumption
  are explicit passes rather than hidden material side effects.
- GPU skinning uses an explicit palette; CPU morph updates are explicit source operations; GL functional
  scenes cover many material/light/deformation paths.
- Guard layers are opt-in and state-hosted, preserving the production draw path.

## Correctness and ownership gaps

- Extended PBR is still modeled as separate Clearcoat/Sheen/Anisotropy/etc. material kinds and renderers,
  so combinations cannot be expressed without multiplying material types. The approved open extension
  composition has not landed in this live branch.
- Standard PBR builds map flags without geometry UV1 information even though a detector and shader
  plumbing exist; the secondary-UV path is currently dead in production.
- Draw-entry pools never receive cleared-list entries back, while entries allocate matrix placeholders;
  the duplicate acquire functions and unused normalMatrix field conceal the lack of actual reuse.
- Rebaking IBL overwrites runtime.ibl without deleting the prior irradiance/prefilter textures.
- The environment source cube is cached once per state, not keyed/versioned by CubeTexture. Its comment
  names a nonexistent destroyGlEnvironment invalidation operation.
- Skybox program/VAO/buffer live only in a module WeakMap; the buffer is not retained in GlSkybox and
  destroyGlSceneRuntime cannot free any of them.
- Skybox and IBL shaders unconditionally sRGB-decode the source cube, ignoring CubeTexture.colorSpace.
- IBL bake disables depth/cull/blend without restoring their previous values. Skybox restores only part
  of the state it changes. These can leak into callers unless a later pass resets everything.
- Blended particles are drawn after all mesh transparency rather than in the shared depth order. Mesh
  origin sorting remains an honest but limited approximation for large/intersecting transparent objects.
- CPU morph writes shared geometry immediately before GL draw, GPU skinning uses another route, while
  bounds/picking depend on separately updated CPU state. Rendered and queried frames can diverge.
- presentGlScene applies transfer encoding but no exposure/tone-map/display-gamut mapping to HDR radiance.

## Architectural conclusion

Keep material lobes, scene-color capture, shadow, IBL, deformation, and output mapping as separately
imported passes/registrations. The missing composition point is an explicit prepared-frame contract plus
an explicit presentation assembly—not a registerAll renderer or a larger material switch.
