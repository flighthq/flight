---
package: '@flighthq/scene3d-gl'
updated: 2026-08-08
by: principal
---

# scene3d-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene3d-gl/src/` on 2026-08-08. A file:line here is
a claim about this tree, not about a session.

- **The environment source cube caches by presence, not by identity.**
  `ensureGlEnvironmentSourceCube` returns the cached texture whenever `runtime.environmentSourceCube`
  is non-null, without comparing the `Environment` it was asked about (`glEnvironmentCube.ts:21`), so
  a second environment silently renders with the first one's cube.
- **The documented escape hatch for that does not exist.** The same doc comment tells the caller "a
  changed cube must drop the cache first via `destroyGlEnvironment`" (`glEnvironmentCube.ts:14`).
  There is no `destroyGlEnvironment` in this repo — the only near name is
  `destroyGlEnvironmentIblBakePrograms` (`glEnvironmentIblBake.ts:57`), which frees bake programs, not
  the cube.
- **Rebaking leaks the previous IBL textures.** `bakeGlEnvironmentIbl` builds fresh irradiance and
  prefiltered cubes and overwrites `runtime.ibl` (`glEnvironmentIblBake.ts:35-36,43`) without deleting
  the ones it replaces. Only `brdfLut` is reused. `destroyGlScene3DRuntime` frees whatever is current
  at teardown, so every rebake before that is an orphan.
- **The IBL bake does not restore all state it touches.** It disables `DEPTH_TEST`, `CULL_FACE`, and
  `BLEND` (`glEnvironmentIblBake.ts:31-33`) and restores only the framebuffer, viewport, and VAO
  (`:39-41`).
- **Skybox GPU resources have no teardown.** `drawGlEnvironmentSkybox` lazily creates a program, VAO,
  and buffer into a module `WeakMap` (`glEnvironmentSkybox.ts:57-77,86`). No `destroy*` reaches it and
  `destroyGlScene3DRuntime` does not know about it, so it is the one scene-gl resource outside the
  one-call teardown.
- **`presentGlScene3D` has no tone map** (`presentGlScene3D.ts:18`). The rgba16f linear intermediate
  goes to the canvas through `presentGlRenderTarget`'s sRGB encode alone, so HDR radiance clips rather
  than rolling off.
- **Anisotropy pairs an anisotropic distribution with isotropic visibility.** The punctual
  contribution is `(flightAnisotropyD - d) * vis * fresnel`, where `vis` is the isotropic
  `visibilitySmith` from the base BRDF (`anisotropyPbrGlExtension.ts:41`; base at `glPbrPrelude.ts:326`).
  The lobe stretches but its shadowing/masking term does not.
- **Specular-glossiness drops its packed map.** The renderer converts the scalars
  (`roughness = 1 - glossiness`) but passes `metallicRoughnessMap: null`
  (`specularGlossinessPbrGlMeshMaterialRenderer.ts:111`), documented at `:39-41`. An asset whose
  gloss varies per texel renders uniformly rough.
- **No combined-extension raster proof.** `functional/scenes/` carries one scene per extension —
  `material-anisotropy`, `material-clearcoat`, `material-iridescence`, `material-sheen`,
  `material-transmission-volume`, all `.webgl.ts` only. Nothing exercises two lobes on one material,
  which is exactly where the shared `PBR_EXTENSION_PUNCTUAL` splice can miscompose.
- **`drawGlScene3DShadowMap` owns its target and its own walk.** It allocates a fixed
  `DIRECTIONAL_SHADOW_MAP_SIZE` target internally (`glShadowMap.ts:51`), re-traverses the scene with
  `forEachNodeDescendant` instead of consuming the prepared render list `drawGlScene3D` already built
  (`glShadowMap.ts:88`), and restores a hand-picked baseline — framebuffer, viewport, texture unit 0,
  cull off/back (`:131-136`) — rather than bracketing exactly what it changed.
- **Transparent meshes and transparent particles do not share one depth order.** Blended mesh subsets
  sort back-to-front among themselves (`drawGlScene3D.ts:208`), then particle emitters draw as a final
  depth-write-off pass afterwards (`drawGlScene3D.ts:265`, `glParticleEmitter3D.ts:410`). A particle
  behind a blended mesh still composites over it.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the entire 2026-06-24 pass and its
  two follow-ups: the transmission approximation the 2026-07-03 entry relocated a TODO for is gone —
  transmission is now a registered extension with a real resolved-scene-color path
  (`transmissionVolumePbrGlExtension.ts`, `glPbrTransmissionSceneColor.ts`) and no "Phase 5" marker
  survives. The `hasUv1` / `hasGlMeshGeometryUv1` thread that occupied four sections of the old file is
  equally dead: no `uv1` define key, helper, or `HAS_UV1` shader path exists here now.
- **2026-08-05** — Post-review sweep over 55 commits: PBR extensions became an open registry with
  versioned program identity, structured explain/sentinel behavior, and opt-in guards.
- **2026-07-03** — `no-warning-comments` enforced over `packages/*/src`; inline TODOs moved out of code.
- **2026-06-25** — Recommended sweep executed nothing; both items' premises had already drifted from
  source.
