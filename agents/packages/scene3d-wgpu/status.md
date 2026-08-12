---
package: '@flighthq/scene3d-wgpu'
updated: 2026-08-08
by: principal
---

# scene3d-wgpu — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene3d-wgpu/src/` on 2026-08-08. A file:line here
is a claim about this tree, not about a session. Gaps stated against GL were re-checked in
`packages/scene3d-gl/src/`, not carried from that cell's notes.

- **One fixed vertex buffer layout, and it is a wrong-stride hazard, not just a missing channel.**
  `VERTEX_BUFFER_LAYOUTS` is a module constant, `arrayStride: 48` over position/normal/tangent/uv0
  (`wgpuMeshPipeline.ts:1234-1236`). A stride-64 geometry carrying `color0` renders as a solid white
  triangle: every vertex past the first is read 16 bytes early, so the positions are wrong too and
  only the default tint reaches the fragment. Declared in `scripts/support.ts` DECLARED_GAPS and
  surfaced in [support-matrix](../../support-matrix.md); `vertexColorWgpuMeshMaterialRenderer.ts:23-25`
  carries the durable note.
- **The same constant is behind three tracked items, and they retire together.** `color0` (above),
  `uv1` (no `uv1` reference exists anywhere in this package — it would take stride 48 → 56), and
  `joints0`/`weights0`, which shipped by **duplicating** the constant rather than deriving one
  (`wgpuSkinPalette.ts:228`, `arrayStride: 80`). A third fixed layout is the position-only depth pass
  (`wgpuShadowMap.ts:227-228`, `arrayStride: 48`).
- **Deriving the layout requires a cache-key change first.** `ensureWgpuScene3DPipeline` keys on
  `family:format|defineKey|blend|skin` with no vertex-layout component
  (`wgpuMeshPipeline.ts:589`), so a derived layout must add a layout token or the first geometry's
  stride is baked into a pipeline the next geometry reuses. Second constraint: WebGPU has no
  `gl.vertexAttrib4f`, which is how the GL path defaults a missing `color0` to opaque white, so
  "geometry without color0" has to be a compiled variant — a `vertexColor` flag on
  `WgpuUnlitDefineKey`, which `GlUnlitDefineKey` already carries (`glUnlitPrelude.ts:39` vs
  `wgpuUnlitPrelude.ts:123`).
- **No PBR extension registry.** GL composes an open `PbrExtension` registry
  (`scene3d-gl/src/glPbrExtensionRegistry.ts`) with seven registered lobes and an
  `ExtendedPbrMaterial` renderer. This package has **zero** occurrences of `PbrExtension` or
  `ExtendedPbrMaterial` and exposes only the built-in StandardPbr / specular-glossiness lane. The
  per-extension raster scenes match: `material-anisotropy`, `material-clearcoat`,
  `material-iridescence`, `material-sheen`, and `material-transmission-volume` are all `.webgl.ts`
  with no WebGPU column.
- **Draw-time aspect is the camera's, not the target's.** `drawWgpuScene3D` calls
  `prepareScene3DRender(state, scene, camera, lights)` with no aspect argument
  (`drawWgpuScene3D.ts:56`), while GL resolves the authoritative aspect from the active pass and
  passes it (`scene3d-gl/src/glViewportAspect.ts:6`, used at `drawGlScene3D.ts:76`). Rendering to a
  target whose ratio differs from the camera's authored one therefore distorts here and does not on
  GL. Tied to the held view-ownership question in
  [render view model](../../render-view-model.md) — unratified, do not build on it.
- **Specular-glossiness drops its packed map.** The renderer converts the scalars but passes
  `metallicRoughnessMap: null` (`specularGlossinessPbrWgpuMeshMaterialRenderer.ts:133`, documented at
  `:48`), so an asset whose gloss varies per texel renders uniformly rough. Same defect as GL.
- **Teardown is piecemeal.** `destroyWgpuScene3DShadow` (`wgpuShadowMap.ts:28`),
  `destroyWgpuScene3DIbl` (`wgpuEnvironmentIblBake.ts:58`), and
  `destroyWgpuParticleEmitter3DResources` each free their own slice.
  There is no `destroyWgpuScene3DRuntime` aggregate — GL's `destroyGlScene3DRuntime` is the one call
  that folds every subsystem, so a wgpu caller must know the full list.
- **Two guard modules have no wgpu twin.** GL carries `enableGlScene3DColorSpaceGuards` and
  `enableGlScene3DDeformGuards` with runtime slots reserved for them
  (`types/src/GlScene3DRuntime.ts:86,97`). This package carries only the custom-shader and
  forward-light-selection guards.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Dropped the whole 2026-06-24 pass plus
  its score table: the biggest false survivor was the "Real OpaqueScene color capture for
  transmission" item and the 2026-07-03 TODO relocated from
  `transmissionVolumePbrWgpuMeshMaterialRenderer.ts:47` — **that file does not exist**, and no
  `transmissionVolumePbrWgpu*` symbol appears anywhere in `packages/`. Also dead: the
  "forward light count specialization design decision" the file asked the user to rule on twice —
  `prepareWgpuScene3DForwardLights` already ranks per-mesh lights at the world bounding sphere, packs
  the contributing four of each family, and deduplicates identical index tuples.
- **2026-08-06** — Established the fixed vertex layout as one gap behind color0/uv1/joints, with the
  white-triangle consequence measured rather than inferred.
- **2026-08-05** — Directional shadows, posed-skin casters, alpha/blend handling, texture-source
  resolution, and scene-coverage explain landed; the inert-UV1 item went obsolete with its define path.
- **2026-07-31** — `getWgpuForwardLightsPreludeWgsl` / `wgpuForwardLightsPrelude.ts`, claimed by the
  2026-06-24 pass, never existed in tracked source.
- **2026-07-03** — `no-warning-comments` enforced over `packages/*/src`; inline TODOs moved out of code.
