---
package: '@flighthq/scene-wgpu'
status: solid
score: 78
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/scene-wgpu.md
  - incoming/builder-67dc46d64 (head + changes.patch)
  - source
---

# Review: @flighthq/scene-wgpu

## Verdict

**solid — 78/100.** The WebGPU/WGSL backend for the 3D scene/mesh subject family. As a _material shading library_ it remains genuinely deep and close to authoritative (a full glTF-tier PBR uber-shader with KHR extension lobes, plus classic/NPR/debug families). The builder pass advanced the _renderer envelope_ the prior depth review flagged as thin: a transparent pipeline variant with back-to-front sorting now exists and works end-to-end, and a complete multi-light forward infrastructure (WGSL helpers, GPU buffer, bind layout, per-frame upload) was built and tested. The honest ceiling: that multi-light infrastructure is **not yet reachable** — every renderer hardcodes the live light counts to zero, so no point/spot/hemisphere light renders today despite the WGSL being present and the buffer being uploaded. The status doc's 88/100 self-estimate over-credits the lighting work; the wiring is built but the feature it enables is dark. 78 reflects real, tested progress on transparency plus dormant-but-correct lighting infrastructure.

## Present capabilities

Grounded in `67dc46d64:packages/scene-wgpu/src/`.

**Material families** (each a `register*WgpuMaterial` + renderer + WGSL prelude where the shader differs) — unchanged and authoritative:

- **PBR Cook-Torrance uber-shader** (`wgpuPbrPrelude.ts`, 22 KB): GGX NDF, Smith height-correlated visibility, Fresnel-Schlick (`distributionGgx`/`visibilitySmith`/`fresnelSchlick` confirmed at prelude lines 244-265), the five standard maps, sRGB→linear decode, alpha-mask discard, double-sided normal flip.
- **PBR extension lobes** as const-flag branches: `clearcoat`, `sheen`, `anisotropy`, `iridescence`, `specular`, `subsurface`, `transmission`/volume — each a distinct registrant. `specularGlossiness` and `standard` packers cover both glTF workflows.
- **Classic / NPR / debug**: `unlit`, `blinnPhong`, `phong`, `lambert`, `toon`, `matcap`, `emissive`, `vertexColor`, `normal`, `depth`, `wireframe` (line-list + derived edge index buffer via `wgpuWireframeUpload.ts`).

**Renderer plumbing** — properly factored:

- A kind-keyed mesh-material registry (`wgpuMeshMaterialRegistry.ts`: `registerWgpuMeshMaterialRenderer` / `resolveWgpuMeshMaterialRenderer`, `DefaultMaterialKind` fallback) — an open registry, not a closed switch (fork B compliant; see Contract & docs fit).
- A define-key → pipeline cache (`wgpuPbrPipelineCache.ts`, format-aware), per-geometry upload caches with version invalidation (`wgpuMeshUpload.ts`, `wgpuWireframeUpload.ts`), group(0)/group(1)/group(2) Frame/Draw/Material bind-group layouts, dynamic-offset per-draw uniforms, a 1×1 placeholder texture.

**New this pass — transparent pipeline + sort** (`drawWgpuScene.ts`, `wgpuMeshPipeline.ts`): the draw loop is now two passes — an opaque pass in scene-graph order followed by a transparent pass that collects `alphaMode === 'blend'` subsets (`isBlendMaterial`), sorts them back-to-front by clip-space W depth (`compareTransparentEntryDepth`), and re-draws them. `createWgpuMeshPipeline` gained a `blendMode` parameter: `'blend'` → premultiplied src-alpha + `depthWriteEnabled: false`; `'opaque'`/`'mask'` → no blend + depth-write. The `blendMode` is threaded through `WgpuPbrDefineKey` and `buildWgpuPbrStandardDefineKey` (reads `surface.alphaMode`). `doubleSided` is now wired to `cullMode`. **This path is complete and reachable** — a blend material does composite correctly.

**New this pass — forward-lights infrastructure** (`wgpuForwardLightsPrelude.ts`, 12 KB): `getWgpuForwardLightsPreludeWgsl()` returns a real WGSL prelude — a `LightBlock` uniform at group(0) binding(1) (sky/ground radiance, vec4u counts, `array<PointLightData, 8>`, `array<SpotLightData, 8>`), plus `getDistanceAttenuation` (glTF KHR inverse-square + range window), `getSpotConeAttenuation` (smoothstep cone), `evaluatePointLight`/`evaluateSpotLight` (full Cook-Torrance), and `evaluateHemisphereLight`. `ensureWgpuLightBlockBuffer`/`ensureWgpuLightBlockBindGroup` lazily allocate the per-state GPU resources; `writeWgpuLightBlockUniform` packs a `SceneLightBlock` into the buffer each frame (called once at the top of `drawWgpuScene`). The PBR `fs_main` loops `for pi < POINT_LIGHT_COUNT` / `for si < SPOT_LIGHT_COUNT` and gates hemisphere on `HEMISPHERE_LIGHT` (lines 425-434); the classic `fs_main` loops the same bounds with a Lambert (not Cook-Torrance) term — a deliberate family distinction. WGSL forward references make the injection order (`define + FORWARD_LIGHTS_WGSL_BODY + PBR_WGSL_BODY`) correct even though the loops call helpers defined later in the PBR body.

**Types-first discipline** (verified in `changes.patch`): `MaxForwardLights = 8`, the `hemisphere?`/`point?`/`spot?` arrays on `SceneLights`, and `hemisphereCount`/`pointCount`/`spotCount` on `SceneLightBlock` were added to `@flighthq/types` first; `packSceneLightBlock` in `@flighthq/render` packs them. The backend implements against the header.

**Scratch-singleton elimination** (`wgpuSceneRuntime.ts`): the former module-level draw scratch (`scratchNormalMatrix`, `scratchClipPos`, `transparentEntries`) now lives on `WgpuSceneRuntime` (`drawSceneClipPos`, `drawSceneNormalMatrix`, `drawSceneTransparentEntries`, `drawSceneWorldOrigin`), initialized per-state in `getWgpuSceneRuntime`. `collectTransparentSubsets` takes a `runtime` param instead of closing over singletons. The exported `DrawSceneTransparentEntry` interface is colocated with the runtime that owns the array. (The per-draw `proxy` constant stays module-level but is write-before-use; documented as borrow-only.)

**Tests**: 189 `it()` blocks across 36 colocated `*.test.ts` (one per source file; only `index.ts` and `wgpuSceneTestHelper.ts` lack tests, both expected). New coverage for the forward-lights define source/suffix/WGSL injection, the classic forward-lights injection, the blend pipeline key, and per-state scratch initialization.

## Gaps

The biggest gap is not absence — it is a **built-but-dark feature**:

- **Forward lights are wired but unreachable.** `buildWgpuPbrStandardDefineKey` (`standardPbrWgpuMeshMaterialRenderer.ts:57-62`) hardcodes `hemisphereEnabled: false`, `pointLightCount: 0`, `spotLightCount: 0`; every classic family's `defineKeyForMaterial` does the same. Because these are compile-time consts, the WGSL `for pi < POINT_LIGHT_COUNT` loops fold to nothing — a scene with point or spot lights renders with directional+ambient only. The buffer is uploaded and bound every frame, but no shader variant ever reads a nonzero count. The renderer's `bind()` _receives_ the live `SceneLightBlock` (with real `pointCount`/`spotCount`) but never feeds those counts into the define key. This is the gap between "infrastructure complete" (true) and "multi-light forward path works" (not yet) — and it turns on an unresolved design decision (specialize-per-count vs. always-8-loop-with-runtime-guard) that the status doc correctly surfaces rather than guessing. Until that is resolved and the count flows into the key, the lighting model in practice is still the one-directional-plus-ambient slice the depth review described.
- **No shadows.** No depth-only pre-pass, no shadow atlas, no PCF/VSM/CSM. Nothing references shadows.
- **No image-based lighting / environment.** PBR ambient is flat irradiance; no cubemap, irradiance, prefiltered-env, or BRDF LUT. The `IBL` define flag / `wgpuIblPrelude` do not exist.
- **No instancing, skinning, or morph targets.** Vertex locations 4/5 (joints/weights) and 6 (uv1) are reserved in comments but not declared; `hasUv1` is in the key and emits a `HAS_UV1` const, but `vs_main` carries no second UV and `VERTEX_BUFFER_LAYOUTS` is unchanged (48-byte stride). This is a declared-but-inert key field — honest, but a half-wired feature.
- **Transmission is still an approximation.** `transmissionVolumePbrWgpuMeshMaterialRenderer` uses a coverage/tint stand-in; true refraction needs an opaque-scene-color capture pass that does not exist.
- **No post-processing / MSAA ownership.** Tonemap/resolve deferred to the effect pipeline; acceptable layering, but this package alone does not produce a finished frame.
- **Fixed primitive coverage.** `triangle-list` + `line-list` only. No strips, point-list, or LOD.
- **No clustered / tiled forward+.** The (dormant) max-8 loop is a Bronze stepping stone; Gold clustering would need a compute culling pass.

## Charter contradictions

None — the charter's North star, Boundaries, Decisions, and Open directions are all `TODO` stubs, so there is no stated principle to contradict. The "What it is" line (seeded from the depth review) accurately describes the package. Everything below in Candidate open directions exists _because_ the charter is silent, not because the code defies it.

One thing worth recording for whoever authors the charter: the package currently ships dormant WGSL (the forward-lights loops, the `HAS_UV1` const) that is reachable only after a deferred decision. That is a defensible "infrastructure-first" posture, but a charter should say whether shipping built-yet-dark shader paths is intended discipline or a smell to close before the next pass.

## Contract & docs fit

**Lives up to the contract:**

- **Naming** — exemplary and greppable. The `Wgpu` infix + full unabbreviated type words make every export globally unique against the `scene-gl` twins. The compile/cache/key/source verb split (`compileWgpu*Pipeline`/`ensureWgpu*Pipeline`, `build*DefineKey`/`build*DefineSource`/ `get*ModuleSourceForKey`) is consistent.
- **`out`-params** — `writeWgpuPbrStandardBlock(out, …)`, `writeWgpuLightBlockUniform`, `collectTransparentSubsets(…, out)` all follow the convention.
- **Registry over switch** — the material dispatch is an open `Map<Kind, …>` registry (`wgpuMeshMaterialRegistry.ts`), exactly fork B's default. No closed `switch(kind)` in the draw path.
- **`Readonly<>`** discipline holds on inputs throughout; the draw scratch is deliberately mutable and documented.
- **`sideEffects: false`**, single root `.` export, no top-level registration — `register*WgpuMaterial` is the opt-in seam. Crate mirror `flighthq-scene-wgpu` is declared in front matter and named per the rust map's `scene-<backend>` layering.
- **Types-first** — the light-block extension landed in `@flighthq/types` before the backend consumed it.

**Candidate revisions to the contract / admin docs:**

- **`render-backend-support.md` is now stale on two counts.** It states "punctual lights unwired" and "wgpu blend modes = none." Blend is now _partially_ wired (a premultiplied src-alpha transparent pipeline variant exists and the transparent sort works), and punctual-light _infrastructure_ exists though the feature is still dark. The doc should be updated to: wgpu has a blend pipeline variant + back-to-front sort; punctual lights are plumbed but not yet count-specialized (no light renders until the define-key wiring lands). Leaving it as a flat "none/unwired" understates transparency and overstates the lighting gap symmetrically.
- **Barrel breadth.** The root barrel re-exports every prelude's key-builder, module-source getter, and pipeline compiler — a very wide public surface for a leaf renderer where most consumers want only the `register*WgpuMaterial` functions + `drawWgpuScene`. This is consistent with the small-functions philosophy and parity-tooling reach, but the charter (when authored) should rule on whether the prelude internals are public API or implementation detail. Not a contract violation; a deliberate surface-size question.

## Candidate open directions

These feed the charter's Open directions — questions the stub charter does not answer that this review had to assume against the AAA fallback:

1. **Forward-light-count strategy (blocking the headline feature).** Specialize a pipeline per live count bucket (max throughput, recompile on count change) vs. always compile `POINT_LIGHT_COUNT=8` and guard with `if (pi < counts.x)` inside the loop (no recompiles, up to 8 idle iterations). This decision gates whether multi-light rendering works at all; the infrastructure is otherwise complete. The status doc explicitly defers it to the user.
2. **Is shipping dormant shader paths (forward loops, `HAS_UV1`) intended infrastructure-first discipline, or a smell to avoid?** Charter should state the bar.
3. **Renderer-envelope scope and order.** The AAA bar for a 3D scene renderer is multi-light + shadows
   - IBL as table stakes. Which of shadows / IBL / skinning / instancing are in this package's scope vs. neighbor packages, and in what order? (fork G accepts full 3D as in-scope SDK-wide; this package's slice needs naming.)
4. **scene-gl ↔ scene-wgpu co-design.** The two are deliberate twins; shadow-map and IBL types should be designed once in `@flighthq/types` and mirrored. Charter should record the twin obligation so a future agent does not advance one backend's lighting without the other.
5. **uv1 / skinning vertex-layout change.** Extending the 48-byte stride (uv1 → 56; joints/weights → more) is a coordinated `@flighthq/mesh` + pipeline change. Charter should note whether scene-wgpu may drive that or must wait on a mesh-side decision.
6. **Public surface size** — prelude internals public vs. implementation detail (see Contract & docs fit).
