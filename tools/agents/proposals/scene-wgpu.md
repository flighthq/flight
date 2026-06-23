---
id: scene-wgpu
title: '@flighthq/scene-wgpu'
type: depth
target: scene-wgpu
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/scene-wgpu.md
  - tools/agents/docs/reviews/depth/scene-wgpu.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 68/100. An AAA material-shading catalogue (Cook-Torrance PBR uber-shader + full glTF KHR extension lobes, classic/NPR/debug families) wrapped in a thin, single-directional+ambient "proving slice" renderer with no shadows, IBL, transparency, instancing, or skinning.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable forward renderer: more than one light, and meshes that can be transparent. These are the two table-stakes gaps a developer hits in the first hour.

- **Multi-light forward path.** The light descriptor types (`PointLight`, `SpotLight`, `HemisphereLight`) already exist in `@flighthq/types`; only `SceneLights` and `SceneLightBlock` are stuck at one directional + one ambient. Widen them and consume them:
  - In `@flighthq/types`: extend `SceneLights` to carry `point: readonly PointLight[]`, `spot: readonly SpotLight[]`, `hemisphere: readonly HemisphereLight[]`; extend `SceneLightBlock` with `pointCount` / `spotCount` and the `MAX_FORWARD_LIGHTS` packed layout the type comment already anticipates. Add a `MaxForwardLights` constant.
  - In `@flighthq/render`: widen `prepareSceneRender`'s light-packing to fill the new `data` layout (position, range, color·intensity, spot cone cos-inner/cos-outer, hemisphere sky/ground) with sRGB→linear at pack time.
  - In `scene-wgpu`: add `wgpuForwardLightsPrelude` (WGSL helpers `evaluatePunctualLight`, `getDistanceAttenuation` with the glTF inverse-square range falloff, `getSpotConeAttenuation`) and wire it into `wgpuPbrPrelude` and `wgpuClassicPrelude` behind `POINT_LIGHT_COUNT` / `SPOT_LIGHT_COUNT` define-key entries (so `buildWgpuPbrDefineKey` and `buildWgpuClassicDefineKey` gain light-count fields and the pipeline cache specializes per count bucket).
- **Alpha-blended transparent pipeline variant.** Today `wgpuMeshPipeline` hardcodes no blend + `depthWriteEnabled: true`. Add a `blendMode: 'opaque' | 'mask' | 'blend'` (or `MaterialAlphaMode` kind in `@flighthq/types`) flag threaded through `createWgpuMeshPipeline` that selects standard premultiplied src-alpha blending and `depthWriteEnabled: false` for `blend`. Add it as a define-key dimension so opaque and blended share a module but get distinct pipelines.
- **Back-to-front transparent draw ordering in `drawWgpuScene`.** Split the visible-mesh walk into an opaque pass (front-to-back, current behavior) and a transparent pass sorted back-to-front by view-space depth (the `SceneRenderList` already has world matrices + view-projection to compute it). This is the minimum needed for blended meshes to composite correctly and is a prerequisite for any real transmission.
- **Parity coverage for the above.** Functional scenes (`scene-multi-light`, `scene-transparent-sort`) under `tests/functional/`, captured and blessed for both raster backends + the Rust mirror, so the new envelope is covered the same way materials are.

### Silver

Competitive with a good open forward renderer (think three.js `WebGPURenderer` minus its frontier features): shadows, image-based lighting, and the mesh-feature set characters and crowds need.

- **Shadow mapping.** The single largest Silver item.
  - `@flighthq/types`: `ShadowMap` descriptor + `LightShadowSettings` (bias, normal-bias, map size, PCF radius) on the light descriptors; a `ShadowAtlas` slot on the scene runtime.
  - `scene-wgpu`: a depth-only pass (`drawWgpuShadowPass` / `compileWgpuShadowPipeline` — vertex-only WGSL, no fragment color), a shadow-sampler comparison bind on `group(0)` Frame, and `sampleWgpuShadowPcf` in a new `wgpuShadowPrelude` consumed by PBR + classic preludes behind a `SHADOW` define. Start with one directional shadow; extend to spot and point (cube/`textureDepthCube`) shadows.
  - **Cascaded shadow maps** for the directional light (`computeWgpuShadowCascades`, cascade split selection in the shadow prelude) — the difference between "has shadows" and "has usable directional shadows on a large scene."
- **Image-based lighting (IBL).** The PBR ambient term is flat irradiance only ("no IBL specular yet" in-source).
  - `@flighthq/types`: an `EnvironmentLight` / `ImageBasedLight` descriptor (irradiance SH or cubemap + prefiltered specular mip chain + intensity/rotation) added to `SceneLights`.
  - `scene-wgpu`: bind environment cubemap + prefiltered-env + BRDF-integration LUT on `group(0)`; `sampleWgpuIblDiffuse` / `sampleWgpuIblSpecular` in a `wgpuIblPrelude` behind an `IBL` define, replacing the flat ambient in `wgpuPbrPrelude`. This is what makes the existing PBR + extension lobes (clearcoat/sheen/iridescence reflections) actually look right.
  - **Environment prefiltering utilities** (`prefilterWgpuEnvironmentMap`, `integrateWgpuBrdfLut`, `projectWgpuEnvironmentToSphericalHarmonics`) — generate the IBL inputs from an equirect/cube source on the GPU rather than requiring offline tools. (Candidate for an `@flighthq/scene-wgpu` helper or a shared `scene` math home so `scene-gl` reuses it.)
- **GPU instancing.** `WgpuMeshInstanceBuffer` upload + an instanced define/pipeline variant + `drawWgpuMeshSubsetInstanced` so a `Mesh` with N instance transforms issues one draw. Requires an `InstancedMesh` / instance-transform array concept in `@flighthq/mesh` + `@flighthq/types`.
- **Skinning (skeletal animation).** Joint-matrix storage-buffer bind, `JOINT_COUNT`/`SKINNED` define in the vertex stage of PBR + classic preludes, and the joint/weight vertex attributes resolved through `ensureWgpuMeshUpload`. Depends on a `Skin` / joint-palette type in `@flighthq/mesh`.
- **Morph targets.** Morph-attribute storage buffers + `MORPH_TARGET_COUNT` define and weight uniform — completes the glTF animation triad alongside skinning.
- **Real transmission.** With the transparent pass in place, add the opaque-scene-color capture (`captureWgpuSceneColor` into an `rgba16float` mip pyramid) that `transmissionVolumePbrWgpuMeshMaterialRenderer` needs to stop being a coverage/tint approximation — refraction reads the blurred scene-color buffer.
- **MSAA + tonemap ownership clarification.** Either configure an MSAA `sampleCount` dimension on the mesh pipelines (define-key + resolve-target contract) or document precisely that the effect pipeline owns resolve/tonemap and provide the bridging contract; right now it is ambiguous which layer produces a finished frame.

### Gold

Authoritative / AAA: the canonical WebGPU forward+ renderer for this SDK. Nothing a domain expert reaches for is missing, performance scales to thousands of lights/draws, and TS↔Rust conformance is exact.

- **Clustered / tiled forward+ lighting.** A compute-shader light-culling pass (`buildWgpuLightClusters`, `assignWgpuLightsToClusters`) so the forward path scales to hundreds–thousands of punctual lights instead of the fixed `MAX_FORWARD_LIGHTS` loop. The Gold answer to the Bronze multi-light path.
- **Area lights.** Consume the existing `AreaLight` type via LTC (linearly-transformed cosines): `wgpuAreaLightPrelude` + the LTC LUT bind. Completes the punctual-plus-area light model.
- **Shadow quality tier.** Soft shadows beyond basic PCF — PCSS (contact-hardening) and/or VSM/ESM variants selectable per light; shadow-atlas packing for many shadowed lights; cube-shadow + spot-shadow parity with directional.
- **Reflection probes & screen-space reflections.** Local cubemap reflection probes (`ReflectionProbe` type, parallax-corrected box projection) for grounded reflections, and an optional SSR pass for sharp mirror surfaces — the next tier of fidelity above static IBL.
- **Order-independent transparency (OIT).** Weighted-blended OIT or per-pixel linked-list as an alternative to the back-to-front sort, for correct overlapping transparency (foliage, particles, glass) without sort artifacts.
- **Full primitive + LOD coverage.** `triangle-strip`, `point-list` (GPU particles), `line-strip`; `MeshLod` selection in `drawWgpuScene` by view-space size; frustum + (compute) occlusion culling at the cluster level.
- **GPU-driven rendering.** Indirect draw (`drawIndexedIndirect`) with a GPU-built draw list, persistent per-frame uniform ring buffers, and bind-group/pipeline state-sort hardening beyond the current contiguous-run batching — the throughput frontier for large scenes.
- **Renderer envelope completeness.** Depth pre-pass option; configurable depth-clamp/reverse-Z; per-material polygon offset; stencil support; a documented HDR→LDR tonemap + color-management contract (ACES/AgX) if ownership lands here.
- **Public-surface tightening.** The depth review flags the barrel as very wide — every prelude key-builder, module-source getter, and bind helper is exported. As part of Gold, audit which prelude internals genuinely need to be public (tests/parity tooling) vs. implementation detail, and narrow the root `.` export to the `register*WgpuMaterial` set + `drawWgpuScene` + the genuinely-reusable pipeline/upload helpers. Confirm `npm run api` symmetry against `scene-gl`.
- **Exhaustive tests, docs, and 1:1 Rust parity.** Per-feature functional scenes (shadows, IBL, instancing, skinning, OIT, clustered lighting) blessed across raster backends; assertion-ported unit tests for every new packer/define-key; the Rust `flighthq-scene-wgpu` crate matching WGSL output and the conformance map updated for any intentional divergence. Performance regression baselines for draw-call count and frame time on a reference scene.

## Sequencing & effort

Recommended order (each unblocks the next; effort is rough relative sizing):

1. **Bronze multi-light path** (M). Lowest-risk, highest-value: descriptor types already exist, so the work is widening `SceneLights`/`SceneLightBlock`, the `prepareSceneRender` packer, and two preludes. **Cross-package + design decision**: this changes `@flighthq/types` and `@flighthq/render` and must be designed once for both `scene-gl` and `scene-wgpu`. Decide the packed `data` layout and `MaxForwardLights` value here — it constrains everything downstream.
2. **Bronze transparent pipeline + sort** (S–M). Independent of lighting; needed before real transmission. Design the `MaterialAlphaMode` kind and the blend define-key dimension in `@flighthq/types` so both backends share it.
3. **Silver shadow mapping** (L). The big one. Directional + PCF first, then cascades, then spot/point. Needs `ShadowMap`/`LightShadowSettings` types and a shadow-atlas runtime slot. **Design decision to surface**: shadow-atlas vs. per-light targets, and whether the depth-only shadow pass lives in `scene-wgpu` or is hoisted into `@flighthq/render` as a backend-agnostic pass contract (it should, for `scene-gl` reuse).
4. **Silver IBL** (M–L). Independent of shadows; pairs naturally with the existing PBR depth and is the highest visual-quality-per-effort win for the material catalogue. Decide whether environment-prefiltering utilities live here or in a shared `scene` math home.
5. **Silver instancing → skinning → morph targets** (M each). Gated on `@flighthq/mesh` + `@flighthq/types` gaining `InstancedMesh`, `Skin`/joint-palette, and morph-attribute concepts — **raise these as `@flighthq/mesh` additions first**; scene-wgpu can only consume what the mesh layer defines. Order: instancing (simplest), then skinning, then morph.
6. **Silver real transmission + MSAA/tonemap ownership** (S–M). Transmission depends on step 2 (transparent pass) and the scene-color capture; the MSAA/tonemap item is mostly a layering decision between this package and the effect pipeline — **surface it to the user as a design question** before building, since it determines whether scene-wgpu produces a finished frame.
7. **Gold tier** (XL, frontier). Clustered forward+ supersedes the Bronze fixed-count loop, so build the Bronze path knowing it is a stepping stone. Area lights, advanced shadows, reflection probes/SSR, OIT, and GPU-driven rendering are each substantial independent efforts; pick by the target application's needs rather than building all six.

Cross-cutting throughout: **every change is a four-surface change** — `@flighthq/types` header first, then `@flighthq/render` shared packing/passes where applicable, then `scene-wgpu` and its `scene-gl` twin in lockstep, then the Rust `flighthq-scene-wgpu` mirror with a conformance-map entry. The single most important design decision to lock early is the multi-light packed `SceneLightBlock` layout and `MaxForwardLights`, because the shadow, IBL, and clustered-lighting work all build on top of it.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/scene-wgpu` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
