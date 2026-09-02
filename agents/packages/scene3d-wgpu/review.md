---
package: '@flighthq/scene3d-wgpu'
status: strong
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (packages/scene3d-wgpu/src/)
  - package.json
---

# Review: @flighthq/scene3d-wgpu

## Verdict

**strong -- 82/100.** The WebGPU/WGSL backend for the 3D scene/mesh subject family. This package has advanced substantially since the prior review. It is no longer a material-shading library with a thin renderer envelope; it is now a broadly capable 3D rendering backend implementing the full forward-lighting model with directional shadows, image-based lighting, GPU skinning, particle emitters, composable shaded materials, custom shader materials, per-map samplers, color adjustment/matrix integration, and per-mesh forward light selection. The material catalogue remains deep and authoritative.

Three features the prior review listed as absent -- forward multi-light rendering, directional shadows, and IBL -- are now implemented end-to-end. The forward light loops are runtime-bounded (`for i < MAX_FORWARD_LIGHTS; if i >= count break`), resolving the previously open design question in favor of the runtime-guard approach (no pipeline recompilation on light count changes). The `HAS_UV1` dormant define field and the hardcoded zero light counts are both removed.

The remaining gaps are: no PBR extension registry (GL has seven registered lobes via `PbrExtension`; this package has zero occurrences of `ExtendedPbrMaterial`), a fixed 48-byte vertex layout that prevents vertex color0/uv1 from reaching the shader, piecemeal teardown (no aggregate `destroyWgpuScene3DRuntime`), the specular-glossiness packed-map drop, and the camera-aspect-at-draw-time discrepancy with GL. The transmission approximation (coverage/tint, no opaque-scene-color capture) is known and shared with GL.

## Present capabilities

Verified against `packages/scene3d-wgpu/src/` as of 2026-09-02.

**Material families** (each a `register*WgpuMaterial` + renderer + WGSL prelude):

- **PBR Cook-Torrance uber-shader** (`wgpuPbrPrelude.ts`, 542 lines): GGX NDF (`distributionGgx`), Smith height-correlated visibility (`visibilitySmith`), Fresnel-Schlick (`fresnelSchlick`) plus roughness-aware variant (`fresnelSchlickRoughness`), six standard maps (base-color, metallic-roughness, normal, occlusion, emissive, alpha) with per-map samplers, sRGB-to-linear decode, alpha-mask discard, double-sided normal flip. Extension lobes (clearcoat, sheen, anisotropy, iridescence, specular, subsurface, transmission) are const-flag branches within one module.
- **Specular-glossiness** (`specularGlossinessPbrWgpuMeshMaterialRenderer.ts`): CPU-side Khronos reference conversion (glossiness-to-roughness, quadratic metallic solver) driving the same PBR uber-shader. Scalar conversion is correct; packed specularGlossinessMap is not remapped (`metallicRoughnessMap: null` at line 133).
- **Classic / NPR / debug**: `blinnPhong`, `phong`, `lambert`, `toon`, `matcap`, `unlit`, `emissive`, `vertexColor`, `normal`, `depth`, `wireframe` (line-list topology + derived edge index via `wgpuWireframeUpload.ts`).
- **ShadedMaterial** (`shadedWgpuMeshMaterialRenderer.ts`): composable pipeline assembled from an ordered modifier feature set via the open `WgpuModifierSnippet` registry (`wgpuShadedModifierSnippet.ts`). Built-in snippets registered by `registerBuiltInWgpuModifierSnippets`.
- **CustomShaderMaterial** (`customShaderWgpuMeshMaterialRenderer.ts`): user-authored WGSL against a fixed ABI (32 vec4 uniforms, 8 textures; `wgpuCustomMaterialAbi.ts`), with opt-in contract guards (`enableWgpuScene3DCustomShaderGuards`).

**Forward lighting (runtime-bounded, not compile-time)**:

- The Frame uniform (`writeWgpuFrameUniform`, `wgpuMeshPipeline.ts`) uploads the full `Scene3DLightBlock.data` including packed point/spot/hemisphere arrays and a `punctualCounts` vec4f carrying the live counts.
- The PBR `fs_main` (`wgpuPbrPrelude.ts:477-523`) iterates `for (var i = 0u; i < MAX_FORWARD_LIGHTS; i++) { if (i >= pointCount) { break; } }` for each punctual family, reading the count from `frame.punctualCounts` at runtime. The classic prelude (`wgpuClassicPrelude.ts:333-366`) uses the identical pattern with Lambert (not Cook-Torrance) shading.
- `prepareWgpuScene3DForwardLights` (`prepareWgpuScene3DForwardLights.ts`) ranks point and spot lights at each visible mesh's world bounding sphere, selects the contributing four, deduplicates identical index tuples, and packs per-mesh light blocks. `drawWgpuScene3D` accepts the result as an optional parameter; meshes then bind their own per-mesh light block instead of the scene-wide one.
- `enableWgpuScene3DForwardLightSelectionGuards` warns when punctual light count exceeds `MAX_FORWARD_LIGHTS` and no per-mesh selection was prepared.
- `explainWgpuScene3DForwardLightSelection` returns a plain-data diagnostic.

**Directional shadows** (`wgpuShadowMap.ts`):

- `drawWgpuScene3DShadowMap` renders all meshes (no frustum cull) from a directional light's orthographic camera into a `depth32float` shadow map, using a dedicated depth-only pipeline with front-face culling. Skinned casters use a separate skinned depth pipeline.
- `WGPU_DIRECTIONAL_SHADOW_WGSL` (`wgpuMeshPipeline.ts:1186-1241`) provides `sampleDirectionalShadow` with PCF kernel support: radius 0 (single tap), radius 1 (3x3), or radius 2 (5x5, bounded by `MAX_DIRECTIONAL_SHADOW_PCF_RADIUS`). Shadow bias and world-space normal bias are configurable.
- Both PBR and classic lit families multiply their directional contribution by the shadow factor.
- `destroyWgpuScene3DShadow` frees the depth map and related GPU resources.

**Image-based lighting** (`wgpuEnvironmentIblBake.ts`, `wgpuEnvironmentSkybox.ts`, `wgpuEnvironmentCube.ts`):

- `bakeWgpuEnvironmentIbl` bakes an Environment's source radiance cubemap into the split-sum IBL set: a 16x16 diffuse irradiance cube (cosine-weighted hemisphere integral), a 64x64 prefiltered specular cube (GGX importance-sampled, 5 roughness mip levels), and a 128x128 BRDF integration LUT (environment-independent, baked once). All bake outputs are `rgba16float`.
- `drawWgpuEnvironmentSkybox` renders the radiance cubemap as a scene backdrop via inverse view-projection ray reconstruction.
- `ensureWgpuEnvironmentSourceCube` / `updateWgpuEnvironmentCubeFace` handle source cube upload and incremental face restamping.
- The PBR `fs_main` branches on `ibl.params.x > 0.5`: if an environment is baked, `sampleIblAmbient` replaces the flat ambient with the split-sum result (diffuse irradiance + prefiltered specular weighted by BRDF LUT, scaled by environment intensity and AO); otherwise falls back to flat ambient.
- Shadow and IBL share group(3) via `ensureWgpuPbrSampleLayout` / `ensureWgpuPbrSampleBindGroup` (8 bindings: shadow uniform + depth + comparison sampler, then IBL uniform + irradiance cube + prefiltered cube + BRDF LUT + filtering sampler), keeping PBR within WebGPU's required maxBindGroups minimum of 4.
- Classic materials use the standalone `ensureWgpuShadowSampleLayout` at group(3) and legacy `ensureWgpuIblSampleLayout` at group(4).

**GPU skinning** (`wgpuSkinPalette.ts`):

- `registerWgpuGpuSkinning` installs the `WgpuSkinningAdapter` on the scene runtime.
- Pose palette: 4 texels per joint in an `rgba32float` arena texture, row-aligned, uploaded per frame with deduplication (the shadow pass and mesh pass share one region per skeleton).
- Normal palette: 3 texels per joint (3x3 inverse-transpose, padded to vec4 columns), in a separate arena texture. The two-palette split is deliberate: the shadow depth pass skins positions only and does not need normal matrices.
- `extendMeshPrelude` injects `skinMatrix` / `skinNormalMatrix` WGSL and adds `joints0`/`weights0` vertex inputs at locations 4/5 with an 80-byte stride.
- `extendShadowDepthPrelude` extends the depth-only shader for skinned shadow casters.
- Bind-pose vertex upload via `getUploadVertices` / `buildSkinBindVertices` when a mesh carries a `skinBindPose`.

**Particle emitters** (`wgpuParticleEmitter3D.ts`):

- `drawWgpuScene3DParticleEmitter3Ds` (called automatically by `drawWgpuScene3D` as a final transparent pass) renders `ParticleEmitter3D` nodes as camera-facing billboards with instanced indexed drawing.
- Per-emitter blend mode variants (Normal, Add, Multiply, Screen), textured vs untextured pipeline variants via `HAS_TEXTURE` override constant. Depth-tested but not depth-writing.
- `destroyWgpuParticleEmitter3DResources` handles teardown.

**Renderer plumbing**:

- Kind-keyed open mesh-material registry (`wgpuMeshMaterialRegistry.ts`: `registerWgpuMeshMaterialRenderer` / `resolveWgpuMeshMaterialRenderer`, `StandardMaterialKind` fallback).
- Define-key to pipeline cache (`ensureWgpuScene3DPipeline`) with blend-mode and skinning suffixes.
- Per-geometry upload cache with version invalidation (`wgpuMeshUpload.ts`, `wgpuWireframeUpload.ts`).
- Group(0) Frame / Group(1) Draw / Group(2) Material bind-group layouts. Dynamic-offset per-draw uniforms via ring buffer. 256-byte aligned Draw slot accommodates base (176 bytes), affine color adjustment (208 bytes), and full color matrix (256 bytes).
- Per-map sampler bind groups (`buildWgpuPerMapMaterialBindGroup`) with rebuild-detection cache.
- 1x1 placeholder texture for untextured map slots.
- Opaque/blend two-phase draw with back-to-front sort for blended entries.
- Per-draw `colorScaleBias` and `colorMatrix` integration spliced into promoted pipeline variants.
- Scene-scoped time (`setWgpuScene3DTime` / `getWgpuScene3DTime`) for animated shaded modifiers.

**Coverage diagnostics** (`explainWgpuScene3DCoverage.ts`):

- `explainWgpuScene3DCoverage` / `hasWgpuScene3DCoverage` report material-kind, texture-source-kind, and modifier-kind coverage against the live registry. Proactive (ask after loading, before first draw).

**Tests**: 359 `it()` blocks across 46 colocated `*.test.ts` files (one per source file; `index.ts` and `wgpuScene3DTestHelper.ts` lack tests, both expected).

## Gaps

- **No PBR extension registry.** GL composes an open `PbrExtension` registry (`glPbrExtensionRegistry.ts`) with seven registered lobes and an `ExtendedPbrMaterial` renderer. This package has zero occurrences of `PbrExtension` or `ExtendedPbrMaterial`. The PBR extension lobes exist as const-flag branches in the uber-shader, but there is no open registration mechanism and no `ExtendedPbrMaterial`-based renderer. The per-extension raster scenes (`material-anisotropy`, `material-clearcoat`, etc.) are `.webgl.ts` with no WebGPU column.
- **Fixed 48-byte vertex layout.** `VERTEX_BUFFER_LAYOUTS` (`wgpuMeshPipeline.ts:1258-1268`) is a module constant: position/normal/tangent/uv0, `arrayStride: 48`. A stride-64 geometry carrying `color0` renders as a solid white triangle (every vertex past the first is read 16 bytes early). The skinned variant duplicates the constant at 80-byte stride (`wgpuSkinPalette.ts:443-456`), and the shadow depth pass has a third 48-byte layout (`wgpuShadowMap.ts:242-244`). WebGPU has no `gl.vertexAttrib4f`, so defaulting a missing `color0` to opaque white requires a compiled variant with a vertex-color flag, which `WgpuUnlitDefineKey` does not carry (though `GlUnlitDefineKey` does).
- **Specular-glossiness drops packed map.** The renderer converts scalars correctly but passes `metallicRoughnessMap: null` (`specularGlossinessPbrWgpuMeshMaterialRenderer.ts:133`), so an asset whose gloss varies per texel renders uniformly rough. Same defect as GL.
- **Teardown is piecemeal.** `destroyWgpuScene3DShadow`, `destroyWgpuScene3DIbl`, `destroyWgpuSkinPalette`, and `destroyWgpuParticleEmitter3DResources` each free their own slice. There is no `destroyWgpuScene3DRuntime` aggregate (GL has `destroyGlScene3DRuntime` as a single teardown call).
- **Draw-time aspect uses the camera's, not the target's.** `drawWgpuScene3D` calls `prepareScene3DRender(state, scene, camera, lights)` with no aspect argument (`drawWgpuScene3D.ts:59`), while GL resolves the authoritative aspect from the active pass and passes it. Rendering to a target whose ratio differs from the camera's authored one distorts here but not on GL. Tied to the held view-ownership question in `render-view-model.md` (unratified).
- **Two guard modules have no wgpu twin.** GL carries `enableGlScene3DColorSpaceGuards` and `enableGlScene3DDeformGuards`. This package carries only custom-shader and forward-light-selection guards.
- **Transmission is an approximation.** The PBR `fs_main` models transmission as attenuated coverage + attenuation-color tint (`wgpuPbrPrelude.ts:532-538`). True refraction needs an opaque-scene-color capture pass that does not exist. The approximation is shared with GL.
- **No spot/point shadow maps.** Only directional shadow is implemented. Spot and point-light shadows, cascaded shadow maps, and advanced shadow filtering (VSM/ESM/PCSS) are absent.
- **No draw-call instancing.** GPU skinning is implemented, but draw-call instancing (rendering the same mesh at many transforms in one draw) is not.
- **No morph targets.** No morph-target vertex attribute support.
- **No clustered/tiled forward+.** The max-4 runtime-bounded forward loop is the only light dispatch.
- **No post-processing / MSAA ownership.** Tonemap/resolve deferred to the effect pipeline; acceptable layering, but this package alone does not produce a finished frame.
- **Fixed primitive coverage.** `triangle-list` + `line-list` only (no strips, point-list, or LOD).

## Charter contradictions

None. The charter's North star and Boundaries match the implemented package. The decisions (WGPU may lead; G-buffer in scope; multi-light MAX with runtime guard; TS leads, Rust conforms) are all consistent with the code.

One charter open direction is now resolved: **Open direction #1 (forward-light-count strategy)** has been decided in favor of the runtime-guard approach. The PBR and classic `fs_main` both iterate `for i < MAX_FORWARD_LIGHTS { if i >= count break }`, reading the count from `frame.punctualCounts` at runtime rather than compile-time specialization. No pipeline recompilation occurs when light counts change. The charter should record this as a settled decision.

**Open direction #2 (dormant shader paths)** is partially resolved: `HAS_UV1` and the hardcoded zero light counts have been removed from the source. No dormant shader paths remain. The charter could close this item.

## Contract & docs fit

**Alignment with the contract:**

- **Naming** -- exemplary and greppable. The `Wgpu` infix + full unabbreviated type words make every export globally unique against the `scene-gl` twins. The compile/cache/key/source verb split (`compileWgpu*Pipeline`/`ensureWgpu*Pipeline`, `build*DefineKey`/`build*DefineSource`/`get*ModuleSourceForKey`) is consistent.
- **`out`-params** -- `writeWgpuPbrStandardBlock(out, ...)`, `writeWgpuDrawUniform`, `writeWgpuFrameUniform`, `explainWgpuScene3DCoverage(out, ...)` all match the convention.
- **Registry over switch** -- the material dispatch is an open `Map<Kind, ...>` registry (`wgpuMeshMaterialRegistry.ts`). The modifier snippet registry is also open. No closed `switch(kind)` in the draw path.
- **`Readonly<>`** discipline holds on inputs throughout; draw scratch and runtime fields are deliberately mutable and documented.
- **Two-lane exports** -- `sideEffects: false`, root `.` export (`index.ts` re-exports from `contract.ts`), `./contract` subpath (`contract.ts` barrel). No other subpaths. No top-level registration; `register*WgpuMaterial` is the opt-in seam.
- **Types-first** -- types consumed are from `@flighthq/types/contract`; no exported types defined inline.
- **Diagnostics inversion** -- guard modules (`enableWgpuScene3DCustomShaderGuards`, `enableWgpuScene3DForwardLightSelectionGuards`) emit through `@flighthq/log`, separately importable. Coverage diagnostics are plain-data `explain*` queries.
- **`destroy*` vs `dispose*`** -- all teardown functions use `destroy*` (freeing GPU textures/buffers), consistent with the convention.
- **No side-effect imports** -- `package.json` declares `"sideEffects": false`. Verified: no module-level registration, no global mutation.
- **Colocated tests** -- one `*.test.ts` per source file, 46 test files, 359 `it()` blocks. `describe` blocks mirror exported names.

**Candidate revisions to the contract / admin docs:**

- **`render-backend-support.md` needs update.** It previously stated "wgpu blend modes = none" and "punctual lights unwired." The package now has: transparent pipeline + back-to-front sort with per-material blend modes; runtime-bounded forward multi-light rendering (point/spot/hemisphere, MAX_FORWARD_LIGHTS=4); directional shadow maps with PCF; IBL via split-sum bake; GPU skinning with normal palettes; particle emitter rendering. The doc should reflect these capabilities.
- **Charter open directions #1 and #2 are resolved.** Forward-light-count strategy: runtime-guard was chosen. Dormant shader paths: all removed (no `HAS_UV1`, no hardcoded zero counts). The charter should record these as settled decisions.
- **Barrel breadth.** The root barrel re-exports every prelude's key-builder, module-source getter, and pipeline compiler. The public lane (`index.ts`) curates 31 exports from the full `contract.ts` surface (45 re-export lines). Whether the prelude internals are public API or implementation detail remains an open surface-size question -- but the two-lane split is functional.

## Candidate open directions

1. **PBR extension registry parity.** GL has an open `PbrExtension` registry with seven registered lobes and an `ExtendedPbrMaterial` renderer. This package has the const-flag shader branches but no open registration mechanism. The charter's Directed section defers this until GL contracts settle; the gap should be tracked and revisited when GL stabilizes.

2. **Fixed vertex layout and the color0/uv1 gap.** The 48-byte stride prevents vertex `color0` and `uv1` from reaching the shader. Deriving the layout requires a cache-key change (vertex-layout component) and a compiled variant (WebGPU has no `gl.vertexAttrib4f` for defaulting missing attributes). The charter's open direction #5 asks whether this package may drive the change or must wait on `@flighthq/mesh`.

3. **Aggregate teardown.** A `destroyWgpuScene3DRuntime` that folds shadow, IBL, skin palette, particle, and material-binding cleanup into one call, mirroring GL's `destroyGlScene3DRuntime`.

4. **Missing guard twins.** GL carries color-space and deform guards; this package carries only custom-shader and forward-light-selection guards. Either implement the twins or record the decision that they are not needed on the WGPU path.

5. **Spot/point shadows and cascaded shadow maps.** Directional shadow is implemented; the shadow types and atlas infrastructure for spot/point shadows are not.

6. **Draw-call instancing and morph targets.** Both require `@flighthq/mesh` + `@flighthq/types` additions before this package can consume them.

7. **Transmission fidelity.** The current coverage/tint model approximates; true refraction needs an opaque-scene-color capture pass. Whether that pass is in scope for the first registered WebGPU extension realization is a charter question.

8. **scene-gl ↔ scene-wgpu twin obligation.** The charter should record that shadow-map and IBL types are designed once in `@flighthq/types` and kept in sync, so no agent advances one backend's lighting without the other. The existing implementation already maintains this parity: both backends consume the same `Scene3DLightBlock`, `Scene3DLightsLike`, `Camera3D`, `DirectionalLight`, and `Environment` types.
