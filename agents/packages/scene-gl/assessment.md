---
package: '@flighthq/scene-gl'
updated: 2026-07-22
basedOn: ./review.md
---

# scene-gl — Assessment

## Directed

1. **Realize ExtendedPbrMaterial through separately imported extension registrations.** Standard PBR
   stays lean and open: neither its prelude nor its define/cache key enumerates built-in extensions;
   extension kinds and contributed source provide extended-program identity. Each PbrExtension kind
   registers its own GL realization. Last-write-wins re-registration must advance a registry version
   or otherwise invalidate compiled variants—a kind-only program key cannot retain stale shader code.
2. **Sample every declared extension map and compose lobes coherently.** Bind each map's own UV set and
   texture transform rather than sampling every slot through the base-color map's shared `v_uv0`.
   Extension energy and orientation must survive both punctual and IBL paths—do not implement
   clearcoat/sheen/anisotropy/subsurface as direct-light-only decorations, and use anisotropic
   visibility with the anisotropic distribution. Combined extensions need raster proof, not only
   source-string tests.
3. **Implement transmission as explicit reusable passes.** Capture opaque scene color, sample the
   refractive path, and apply Beer–Lambert absorption from thickness/attenuation/IOR inputs. Project
   refraction through the camera rather than adding world-space XY directly to screen UV, preserve the
   Fresnel-reflected surface lobe instead of mixing all surface radiance away, filter scene color by
   roughness, and prevent sampling a texture attached to the active draw framebuffer.
4. **Follow diagnostics inversion.** Missing registrations, duplicate kinds, texture-unit exhaustion,
   and unsupported combinations return sentinels with shakeable explain/guard layers rather than
   unconditional draw-path throws; normal rendering skips invalid duplicates deterministically and
   an explicitly enabled guard warns through `@flighthq/log` without changing control flow. Keep the
   explainer/strings in a sibling diagnostic module, use the standard message-with-fixing-call shape,
   and test both fire and silent cases.
5. **Add exhaustive GL behavior tests.** Cover scalar and map inputs, multi-extension composition,
   diagnostics, punctual plus IBL realization, and transmission assembled from a real rendered and
   resolved opaque target against a distinguishable background.
6. **Keep backend caches private to state/runtime.** Export operations, not caches.
7. **Keep the vendor-extension seam in the header layer.** Any exported registration contract that a
   third-party extension must implement—including the GL snippet, bind context, support diagnostic,
   shader contribution, and caller-owned transmission scene-color shape—belongs in
   `@flighthq/types`; `@flighthq/scene-gl` should export implementations against those shared types,
   not define cross-package API shapes inline. The public bind context should provide the necessary
   uniform and texture operations without exposing private `GlPbrProgram` or `GlPbrDefineKey`
   implementation shapes. Prelude, program-cache, standard-block, raw uniform-location, and scene
   runtime helpers are backend implementation modules, not root-barrel API atoms.

## Recommended

1. **Wire the existing UV1 detector into production PBR variants.** The shader/detector path exists but
   standard PBR never passes geometry UV1 presence into its define key, so occlusion still samples UV0.
2. **Recycle or remove the draw-entry pools.** The current lists are cleared without returning entries
   to the pools, so the pool names imply reuse while every frame allocates fresh records.
3. **Remove the dead draw-entry normalMatrix field and collapse duplicate acquire helpers.** Both are
   within-package implementation noise that obscures the actual per-draw normal-matrix computation.
4. **Delete old IBL textures on rebake.** Replacing runtime.ibl currently abandons the previous
   irradiance and prefiltered textures.
5. **Add deterministic skybox teardown.** The per-state skybox program, VAO, and vertex buffer are held
   only in a module WeakMap; the buffer is not even retained in the record, and destroyGlSceneRuntime
   cannot free any of them.
6. **Fix the nonexistent invalidation contract.** ensureGlEnvironmentSourceCube says callers should
   use destroyGlEnvironment when the cube changes, but no such function exists.

## Depth gaps

1. **Make environment caches identity/version aware.** Switching CubeTexture, changing faces, or updating
   a dynamic probe must invalidate/rebuild source cube and IBL data explicitly; intensity-only changes
   should not force a radiance rebake.
2. **Honor CubeTexture.colorSpace.** Skybox and both IBL bake shaders unconditionally apply sRGB decode,
   so a linear/HDR cube is decoded incorrectly despite the descriptor declaring its space.
3. **Preserve or explicitly own GL state across auxiliary passes.** IBL bake disables depth/cull/blend
   without restoring them; skybox restores only part of depth state and forces blend off. Either bracket
   all touched state or define these as pass boundaries that re-establish a documented baseline.
4. **Define HDR scene presentation.** presentGlScene writes HDR radiance then applies only an sRGB OETF.
   Compose an explicit exposure/tone-map/output transform for the common no-custom-effects assembly.
5. **Unify transparent ordering across subject families.** Transparent particles render after all
   meshes rather than participating in the blended depth order. Large/intersecting meshes still need a
   documented route to per-subset ordering or optional OIT.
6. **Finish scene semantic depth before acceleration.** Instancing, LOD, shared prepared deformation,
   shadow/probe invalidation, and picking coherence must use the same scene facts as draw. GL instance
   buffers key off the versioned instance-data entity and prepared count; LOD consumes the prepared
   level rather than selecting again in the backend. Neither belongs in the material renderer registry.
7. **Turn the directional shadow proof into a composable pass.** `drawGlSceneShadowMap` currently hides a
   fixed-size target allocation on the scene runtime, traverses/selects/deforms the scene independently,
   ignores the selected DirectionalLight's declared shadow settings, and restores only a hand-picked GL
   baseline rather than the exact incoming framebuffer/viewport/scissor/depth/cull/program/VAO/texture
   state. Consume the same prepared draw entries as the forward pass, accept an explicit target plus
   viewport and shadow-view descriptor, upload bias/filter policy, and bracket exact state even on a
   thrown upload/draw. Keep target caching as an optional state-owned assembly above that allocation-free
   pass, not a side effect inseparable from drawing.

## Backlog

- Order-independent transparency is an optional backend technique, not the base draw contract.
- WGPU parity remains deferred until GL contracts and functionals settle.

## Approved

- [2026-07-21 · completed] Packed mesh attributes bind through `vertexAttribPointer`, matching the
  built-in shaders' float/vec inputs: unsigned joints convert without normalization and unorm
  color/weight channels normalize in fixed-function input assembly. The integer-pointer path is
  deliberately absent until a separately declared ivec/uvec shader input exists.
- [2026-07-22 · completed] Forward and shadow mesh draws consume `MeshGeometry.topology` through one
  upload-owned effective GL primitive mode instead of hard-coding triangles. Indexed and non-indexed
  list/strip/point draws share the same subset path; non-indexed uploads retain their real vertex count,
  cached uploads observe topology edits without buffer churn, and dropping indices deletes the obsolete
  GPU buffer. glTF line-loop/triangle-fan conversion and raster captures remain importer/evidence work.
