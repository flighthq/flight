---
package: '@flighthq/scene3d-gl'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - source
  - tests
  - types
  - package.json
---

# scene3d-gl -- Review

## Verdict

**Solid -- 80/100.** scene3d-gl is a substantial WebGL 2 forward renderer: 65 source files
(~16,700 lines including tests), every source file has a colocated test, and the package cleanly
implements the `<subject>-<backend>` leaf pattern. The material-renderer registry is an
open per-state kind map with sentinel-on-missing behavior; PBR extensions compose through an
independently registered contribution system with versioned program identity; guard layers are
opt-in via nullable runtime slots and tree-shake out of the production draw path.

The architecture is sound -- per-state runtime, explicit registration, two-pass
opaque/blended draw, shared lit-light spine, define-key program cache. What holds the score below
90 is accumulated correctness and ownership debt in the auxiliary passes: environment caching is
identity-unaware with a nonexistent invalidation function, IBL rebake leaks the textures it
replaces, skybox GPU resources sit outside the one-call teardown, the shadow pass independently
traverses the scene instead of consuming the prepared draw list, anisotropy pairs an anisotropic
distribution with isotropic visibility, specular-glossiness drops per-texel variation, transparent
particles and transparent meshes do not share one depth order, and the HDR output has no
exposure/tonemap path. None of these are structural blockers -- each is a localized fix -- but
together they represent the largest concentration of correctness debt in the package.

## Present capabilities

- **Open material-renderer registry.** `registerGlMeshMaterialRenderer` installs a
  `GlMeshMaterialRenderer` for a `Kind` on a per-state registry table; `resolveGlMeshMaterialRenderer`
  resolves by kind with a `StandardMaterialKind` fallback, or returns null (the subset is skipped).
  No auto-registration at module top level; each `registerGl*Material` is an explicit opt-in call.
- **Material families.** Standard PBR (Cook-Torrance GGX), extended PBR (composable extension
  contributions), specular-glossiness (CPU conversion to metallic-roughness), classic
  (lambert/phong/blinn-phong), shaded (modifier-snippet composition with vertex/fragment/surface
  slots), matcap, toon, unlit, emissive, depth, normal, vertex-color, wireframe, and custom-shader.
  Each family has its own renderer, prelude, and colocated test.
- **PBR extension registry.** `registerGlPbrExtension` adds an extension by `Kind` into a
  state-hosted registry table. `extendedPbrGlMeshMaterialRenderer` resolves contributions at bind
  time, compiles an uber-shader variant keyed by extension contribution keys plus the standard
  map/alpha flags, and binds each extension through a typed `GlPbrExtensionBindContext`. Seven
  registered extensions: anisotropy, clearcoat, iridescence, sheen, specular, transmission-volume,
  and wrapped-diffuse. The extension registry has its own revision counter
  (`pbrExtensionRevision`) that folds into program identity.
- **Two-pass forward draw.** `drawGlScene3D` partitions visible mesh subsets into opaque (depth-write
  on, no blending) and blended (back-to-front sorted by projected mesh-origin depth, GL blending
  enabled, blend-mode resolved through render-gl's canonical registry). Contiguous renderer+material
  runs share a single bind. The draw accepts an optional `GlScene3DForwardLightList` for per-mesh
  light selection.
- **Directional shadow mapping.** `drawGlScene3DShadowMap` renders scene depth from a light's
  orthographic camera into a `depth-stencil-sampled` render target. GPU-skinned casters deform in
  the depth vertex shader from the same bone palette the forward pass uses. `bindGlMeshLightBlock`
  binds the shadow map and its PCF parameters to every lit family.
- **Environment: source cubemap, skybox, and split-sum IBL.** `ensureGlEnvironmentSourceCube`
  uploads six faces with color-space-aware internal format selection. `drawGlEnvironmentSkybox`
  renders a screen-filling inverse-view-projection pass with depth writes off.
  `bakeGlEnvironmentIbl` produces irradiance cubemap, roughness-mipped prefiltered specular
  cubemap, and BRDF integration LUT. PBR ambient reads the baked set.
- **GPU skinning.** Bone palette uploaded as an RGBA32F data texture (`ensureGlSkinPalette`);
  `skinMatrix()` and `skinNormalMatrix()` deform in the vertex shader via `texelFetch`. Separate
  normal palette for the inverse-transpose joint matrices. Skin bind pose is uploaded once and
  reused across frames (the upload tracks `skinBindUploaded`).
- **Particle emitter rendering.** `drawGlScene3DParticleEmitter3Ds` renders 3D particle emitters as
  instanced billboard quads after the two-pass mesh draw. Integrated into `drawGlScene3D` as a
  final transparent pass.
- **Per-mesh forward light selection.** `prepareGlScene3DForwardLights` selects point and spot
  lights by estimated contribution at each mesh's world bounding sphere. Identical light-index
  tuples share packed blocks, preserving material bind runs.
- **Scene coverage diagnostics.** `explainGlScene3DCoverage` reports every kind in a scene's usage
  manifest with its registration status; `hasGlScene3DCoverage` is the zero-allocation predicate
  form. Covers material kinds, texture source kinds, and modifier snippet kinds.
- **Five guard layers,** each opt-in via a nullable runtime slot:
  - Color-space guard: warns when drawing to canvas without a linear target.
  - Deform guard: warns when a morphed/skinned mesh reaches draw without its prepare pass.
  - PBR extension guard: warns on missing registration, duplicate kind, framebuffer feedback,
    texture-unit exhaustion.
  - Custom-shader guard: warns on u_normalMatrix mat3/mat4 type mismatch.
  - Forward-light selection guard: warns when punctual lights exceed MAX_FORWARD_LIGHTS without a
    prepared selection list.
- **Transmission scene color.** `setGlPbrTransmissionSceneColor` accepts a caller-owned resolved
  opaque-pass texture; the transmission extension projects refracted world positions through the
  view-projection, filters by roughness LOD, and applies Beer-Lambert attenuation.
- **Draw-entry pooling.** Opaque and blended draw entries recycle between frames via per-state
  pools (`recycleDrawEntries` returns entries to the pool; `acquireDrawEntry` pops or allocates).
- **Explain/sentinel diagnostics model.** `explainGlPbrExtensions` returns structured
  `GlPbrExtensionIssue[]` without side effects; the guard layer consumes them into log warnings.
  Invalid draws take a null-program sentinel (`activeMeshProgram = null`) rather than throwing.
- **Per-state runtime isolation.** `GlScene3DRuntime` holds program cache, upload cache, draw lists,
  pools, environment/IBL/shadow state, skin palettes, and guard slots. Two render states never share
  mutable draw state.

## Gaps

### Correctness

- **Environment source cube is identity-unaware.** `ensureGlEnvironmentSourceCube`
  (glEnvironmentCube.ts:29) returns the cached texture whenever `runtime.environmentSourceCube` is
  non-null, without comparing the `Environment` entity it was asked about. A second environment
  silently renders with the first one's cube.
- **The documented invalidation escape hatch does not exist.** The doc comment at
  glEnvironmentCube.ts:22 tells callers to invalidate via `destroyGlEnvironment`. No function by
  that name exists in the package; the only near name is `destroyGlEnvironmentIblBakePrograms`,
  which frees bake programs, not the source cube.
- **IBL rebake leaks prior textures.** `bakeGlEnvironmentIbl` (glEnvironmentIblBake.ts:53) writes
  fresh irradiance and prefiltered cubes to `runtime.ibl` without deleting the ones it replaces.
  Only `brdfLut` is reused. `destroyGlScene3DRuntime` frees whatever is current at teardown, so
  every rebake before that orphans the prior pair.
- **Anisotropy pairs an anisotropic distribution with isotropic visibility.** The punctual
  contribution in `anisotropyPbrGlExtension.ts` computes `(flightAnisotropyD - d) * vis * fresnel`,
  where `vis` is `visibilitySmith(nDotV, nDotL, roughness)` from `shadePbrPunctual` in
  glPbrPrelude.ts -- the isotropic Smith term. The distribution stretches by anisotropy but the
  shadowing/masking term does not, producing incorrect energy balance under strong anisotropy.
- **Specular-glossiness drops its packed map.** The renderer converts scalar factors but passes
  `metallicRoughnessMap: null` (specularGlossinessPbrGlMeshMaterialRenderer.ts:111). An asset
  whose glossiness varies per texel renders with uniform roughness. The code comments this
  explicitly (lines 39-41); the texture workflow remains unimplemented.
- **Transparent meshes and transparent particles do not share one depth order.**
  Blended mesh subsets sort back-to-front among themselves (drawGlScene3D.ts:213), then particle
  emitters draw as a final pass (drawGlScene3D.ts:282). A particle behind a blended mesh still
  composites over it.

### GPU resource ownership

- **Skybox GPU resources have no teardown.** `drawGlEnvironmentSkybox` lazily creates a program,
  VAO, and buffer into a module WeakMap (glEnvironmentSkybox.ts:61-83). No `destroy*` reaches them,
  and `destroyGlScene3DRuntime` does not know about them. The vertex buffer is not even retained in
  the `GlSkybox` record (it is created and immediately released from the local variable scope after
  the VAO binds it). These are the one scene-gl GPU resource outside the one-call teardown.
- **IBL bake programs use a separate module WeakMap.** `destroyGlScene3DRuntime` calls
  `destroyGlEnvironmentIblBakePrograms` to reach them, which works, but the separate cache is an
  indirection `destroyGlScene3DRuntime` must know about and maintain.

### Shadow pass architecture

- **`drawGlScene3DShadowMap` independently traverses the scene.** It uses `forEachNodeDescendant`
  (glShadowMap.ts:89) instead of consuming the prepared render list that `drawGlScene3D` already
  built. This means a second full scene traversal with its own mesh detection
  (`mesh.geometry == null` structural test), no frustum culling against the shadow camera, and no
  reuse of the prepared draw-entry partition.
- **The shadow target is internally allocated at a fixed size.** The `DIRECTIONAL_SHADOW_MAP_SIZE`
  constant determines the render target dimensions (glShadowMap.ts:52-56). The target allocation is
  a side effect inseparable from drawing, not a composable pass.

### Output

- **No tone map or exposure control.** `presentGlScene3D` (presentGlScene3D.ts:18-32) composes
  begin/draw/end/present. The rgba16f linear intermediate goes to the canvas through
  `presentGlRenderTarget`'s sRGB encode alone: HDR radiance clips rather than rolling off. The
  charter's north star says "Linear HDR out, tonemap owned downstream," which is correct as a
  boundary, but no downstream tonemap exists in this package or as a documented composition point.

### Testing

- **No combined-extension raster proof.** Functional scenes exercise one extension per scene
  (`material-anisotropy`, `material-clearcoat`, etc.), all `.webgl.ts` only. Nothing exercises two
  or more PBR extension lobes on one material, which is where the shared `PBR_EXTENSION_PUNCTUAL`
  splice can miscompose.
- **IBL bake is not unit-testable under the current mock.** The status records this deliberately:
  `FakeGl2` does not implement `createFramebuffer` or the float-cube path needed for the bake.
  Functional `env-ibl` capture is the regression surface.

## Charter contradictions

- **Pool semantics (charter open direction).** The charter asked whether the draw-entry pool should
  be a real acquire/release bracket or dropped for plain per-frame arrays. It IS now a working pool:
  `recycleDrawEntries` returns entries; `acquireDrawEntry` pops or allocates. The charter open
  direction is resolved in practice, though the charter text has not been updated to reflect this.
- **`destroyGlEnvironment` contract (charter open direction).** The charter asks where GPU teardown
  lives. In practice, `destroyGlScene3DRuntime` is the one-call teardown, but it does not reach
  skybox resources (WeakMap-cached), and the doc comment in `ensureGlEnvironmentSourceCube` names a
  function that does not exist. The charter's teardown question is partially answered.
- **Tangent transform (status stale item).** status.md's first open item describes
  `v_tangent = vec4(u_normalMatrix * localTangent, ...)` in glClassicPrelude.ts:169 and
  glShadedPrelude.ts. This is stale: all three preludes (classic line 181, shaded line 269, PBR
  line 173) now use `modelRotation * localTangent` where `modelRotation = mat3(u_model)`, with an
  explicit comment explaining the tangent is a true surface vector, not a covector. The status
  should be updated to retire this item.

## Contract and docs fit

- **Two export lanes.** package.json declares `.` and `./contract` with matching types/default
  entries. `index.ts` re-exports a curated public API subset from `contract.ts`; `contract.ts`
  re-exports everything via `export *` from each source module. This matches the two-lane convention.
- **`sideEffects: false`.** Declared in package.json and honored in source: no module-top-level
  registration, no global mutation, no listeners/timers. Every `register*` is an explicit call.
- **Dependencies.** 14 runtime dependencies listed; all are `@flighthq/*` workspace packages
  at `"*"`. `@flighthq/particleemitter`, `@flighthq/skeleton3d`, and `@flighthq/entity` are
  correctly in `devDependencies` (used only in tests). No external third-party dependencies.
- **Test coverage structure.** 63 source files (excluding contract.ts and index.ts barrels), all 63
  have colocated `.test.ts` files. `describe` blocks in tests are alphabetized and mirror exported
  function names, consistent with the testing convention.
- **Type ownership.** All exported types live in `@flighthq/types`: `GlScene3DRuntime`,
  `GlScene3DShadow`, `GlScene3DIbl`, `GlScene3DDrawEntry`, `GlMeshUpload`, and related interfaces.
  The implementation package exports functions only. The `GlScene3DRuntime` type definition in
  `types/src/GlScene3DRuntime.ts` carries field-level documentation for every slot.
- **Naming.** Exported function names include the full unabbreviated type they operate on
  (`drawGlScene3D`, `ensureGlEnvironmentSourceCube`, `registerGlStandardPbrMaterial`). The `Gl`
  prefix disambiguates from the scene-wgpu peer.
- **Diagnostics inversion.** Guard layers are separately imported (`enableGlScene3DColorSpaceGuards`,
  `enableGlPbrExtensionGuards`, etc.) and emit through `@flighthq/log`. Core modules expose the
  `explain*` query counterpart returning plain data (`explainGlPbrExtensions`,
  `explainGlScene3DCoverage`, `explainGlScene3DForwardLightSelection`). Silent sentinels
  (`activeMeshProgram = null`) handle invalid draws without throwing.

## Candidate open directions

1. **Environment identity/version awareness.** Make the source-cube and IBL caches identity- or
   version-keyed so a second `Environment` entity rebuilds instead of silently reusing. Add
   `destroyGlEnvironmentSourceCube` (or an invalidation verb) to replace the nonexistent
   `destroyGlEnvironment`. Delete prior IBL textures on rebake. Fold skybox GPU resources into
   `destroyGlScene3DRuntime`.
2. **Anisotropic visibility.** Replace the isotropic `visibilitySmith` in the anisotropy punctual
   contribution with a height-correlated anisotropic Smith-GGX term that accounts for the
   direction-dependent roughness.
3. **Specular-glossiness texture workflow.** Either sample the packed specularGlossinessMap
   (RGB specular + A glossiness) in a dedicated GL path, or document that the factor-only
   conversion is the intentional scope and rename the renderer to reflect it.
4. **Shadow pass as a composable draw.** Consume the same prepared draw entries as the forward pass,
   accept an explicit target + viewport, and bracket exact GL state rather than hand-picking
   restores. Separate target caching from the draw so the pass is allocation-free.
5. **Unified transparent ordering.** Define a prepared sort seam that covers both blended mesh subsets
   and particle emitters in one depth-sorted interleave, or document the mesh-first/particle-second
   order as an intentional approximation with a route to optional OIT.
6. **HDR presentation assembly.** Define a composable exposure/tonemap step between the linear forward
   output and the sRGB present, even if the initial implementation is a simple Reinhard or ACES
   filmic curve. The charter says tonemap is downstream -- make "downstream" a named composition
   point rather than an absence.
7. **Combined-extension raster proof.** Add a functional scene exercising two or more PBR extension
   lobes on one material (e.g., clearcoat + anisotropy, or sheen + iridescence) to validate the
   `PBR_EXTENSION_PUNCTUAL` splice composes correctly across lobes.
8. **Retire stale status items.** The tangent-transform open item in status.md is resolved in source.
   The IBL bake state restoration is also fixed (save/restore of depth/cull/blend added).
