---
id: scene-gl
title: '@flighthq/scene-gl'
type: depth
target: scene-gl
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/scene-gl.md
  - tools/agents/docs/reviews/depth/scene-gl.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 62/100; a genuinely deep material/shader library bolted to a deliberately minimal one-light forward renderer (one directional + one ambient, no shadows, no IBL, no transparency sort, no instancing/skinning).

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable real-time renderer: lift the one-light proving slice to N punctual lights and add the transparency pass. This is the 20% that unblocks every lit family at once and makes scenes look like scenes. All achievable without new GPU subsystems (no FBOs beyond what `render-gl` already pools).

- **Multi-light forward path (the single highest-leverage gap).** Grow the choke point:
  - `@flighthq/types`: replace the one-slot `SceneLights` with `directionals: readonly Readonly<DirectionalLight>[]`, `points: readonly Readonly<PointLight>[]`, `spots: readonly Readonly<SpotLight>[]`, `ambient`, plus a `MAX_FORWARD_LIGHTS` constant. Grow `SceneLightBlock` to a packed std140 array of punctual lights (position/direction/color·intensity/range/inner-cone/outer-cone) with per-type counts.
  - `@flighthq/render`: `prepareSceneRender` packs the new block (sRgb→linear, intensity premultiply at pack time, per-light range culling against the frustum).
  - scene-gl: rewrite `GL_MESH_LIGHT_BLOCK_GLSL` + `resolveGlLitLocations` + `bindGlMeshLightBlock` to a bounded shader loop over the arrays; add inverse-square + range attenuation for point lights and smooth inner/outer cone falloff for spot lights. This one change lights up `lambert`/`phong`/`blinnPhong`/`toon` and the entire PBR family with no per-family edits (they all read the shared block).
- **Transparency pass in `drawGlScene`.** Split the visible list into opaque and blended runs (drive off `Material` `blendMode`/`alphaMode` already in the data); draw opaque front-to-back, then blended back-to-front by camera distance. Add `getSceneRenderDrawOrder`-style sort scratch (reused, no per-frame alloc). Today there is _no_ sorting at all — blended PBR/unlit subsets composite wrong.
- **Second UV set (`uv1`).** Add `uv1` (attribute location 5) to `ensureGlMeshUpload`'s `ATTRIBUTE_LOCATION` and a `UV1` define across the PBR define-key so occlusion/lightmap maps on a second coordinate set load correctly — a flat glTF-coverage gap.
- **Hemisphere + ambient gradient.** Consume the already-defined `HemisphereLight` (sky/ground colors) in the shared light block — trivial sibling of the ambient term, large visual payoff for outdoor scenes.

### Silver

Competitive with a good glTF-class WebGL2 renderer: shadows, image-based lighting, and the asset-coverage features (skinning, instancing) a professional 3D app expects. This is where scene-gl becomes a renderer you would actually choose. Each item is a real GPU subsystem and depends on Bronze's multi-light block.

- **Shadow mapping** (the largest single Silver item):
  - `@flighthq/types`: `ShadowMap`/`ShadowAtlas` descriptors, `ShadowSettings` (size, bias, normal-bias, PCF kernel, cascade splits) on the light types; `ShadowKind` string ids.
  - `@flighthq/render` + scene-gl: a depth-only pre-pass (`drawGlShadowDepth`) into pooled depth render targets (reuse `glRenderTargetPool`); directional **cascaded shadow maps** (CSM, 3–4 cascades with stabilized splits), spot shadow maps, and point shadow via a cube/dual-paraboloid depth map.
  - Shader side: `samplerShadow`/`sampler2DShadow` sampling with **PCF** (3×3 / Poisson) and slope-scaled depth bias in `GL_MESH_LIGHT_BLOCK_GLSL`; per-cascade selection by view depth. Real-time 3D without shadows is not competitive.
- **Image-based lighting (makes the PBR family physically complete).** The `Environment` + `CubeTexture` types already exist; build the GPU path:
  - `@flighthq/types`/`@flighthq/render`: `EnvironmentResources` (prefiltered specular mip chain, irradiance map, shared BRDF integration LUT).
  - scene-gl: `samplerCube` upload for `CubeTexture`; offline-ish bake functions `bakeGlIrradianceCubeMap`, `bakeGlPrefilteredEnvironmentMap`, `bakeGlBrdfLut` (compute once per environment, cache on the runtime); replace the PBR ambient term's inline "no IBL specular yet" with split-sum IBL (diffuse irradiance + prefiltered specular + BRDF LUT). This is the most visible PBR shortfall today — metals currently have no specular environment.
  - **Skybox renderer** — `drawGlSkybox(state, camera, environment)` sampling the radiance cubemap at far depth.
- **GPU skinning + morph targets** (glTF asset coverage):
  - `@flighthq/types`: joint/weight vertex semantics (`joints0`/`weights0`), `SkinnedMesh`/`MorphTargets` descriptors, joint-matrix palette.
  - scene-gl: `joints0`/`weights0` attributes in `ensureGlMeshUpload`; a `SKINNED` define adding the joint-palette uniform/UBO and skin transform in every mesh vertex prelude; morph-target attribute streams + per-target weights. Skeletal animation timing itself lives upstream; scene-gl owns the GPU vertex transform.
- **Instanced rendering.** `drawElementsInstanced` path — `GlInstanceBuffer` + an `INSTANCED` vertex define reading per-instance world/normal matrices from an instance attribute or UBO; batch identical mesh+material across nodes. Standard for foliage/props.
- **Transmission's real refractive path.** Complete the documented Phase-5 TODO: an opaque-scene-color capture target the `transmission` lobe samples (refraction via screen-space, roughness-based mip blur), replacing the current approximation placeholder.
- **Per-material GL state correctness.** Surface and bind depth-write/depth-test/cull/blend-equation state per material (alpha-mask vs alpha-blend vs opaque, `KHR_materials_unlit` depth handling), so the transparency pass and double-sided handling are fully correct, not best-effort.

### Gold

Authoritative / AAA — the canonical reference WebGL2 forward renderer for the Flight 3D stack. Exhaustive coverage, measured performance, full error handling, render-test baselines, and 1:1 `flighthq-scene-gl` (and `scene-wgpu`) parity. Nothing a domain expert finds missing.

- **Clustered / forward+ lighting.** Replace the bounded forward loop with a clustered light culling pass (froxel light lists) so hundreds of punctual lights are affordable. `GlClusterGrid` build pass + per-cluster light index lists; the shader iterates only the cluster's lights. The bounded loop becomes the small-scene fast path.
- **Area lights.** Consume the already-defined `AreaLight` via LTC (linearly-transformed cosines) for rect/disk/tube — the high-end lighting feature that distinguishes AAA renderers.
- **Advanced shadows.** VSM/EVSM and/or moment shadow maps as a quality option; PCSS contact-hardening soft shadows; shadow-map atlas packing across many lights; cascade blending to hide seams; per-light shadow-quality budget.
- **Soft-particle / depth-aware effects seam, OIT.** Weighted-blended order-independent transparency as an alternative to the sorted pass for heavy transparency; depth pre-pass option for overdraw reduction.
- **Full glTF feature completeness.** Sparse accessors, all KHR extensions the shader lobes imply round-tripped end-to-end, `KHR_lights_punctual` import mapping, vertex tangent generation fallback, multi-primitive batching, the remaining UV sets, and per-texture transforms (`KHR_texture_transform`). Where importing belongs to a neighbor, spawn it as the `-formats` package (`@flighthq/scene-formats` or `@flighthq/gltf-formats`) rather than coupling the renderer to a parser.
- **Performance + diagnostics.** UBO-backed camera/light/material blocks (replace per-uniform uploads), program/VAO/state-change minimization with a sort key, GPU timer-query instrumentation, a `getGlSceneRenderStats` (draw calls, triangles, state changes, shadow passes), and a frame-budget-aware shadow/IBL update scheduler. Verify with `npm run size` that the renderer stays tree-shakable per-family.
- **Robust error handling & capability fallback.** Sentinel-return (`null`/`-1`, never throw) on shader-compile/link failure, missing required extensions (`EXT_color_buffer_float` for rgba16f, float-depth-texture, instancing), and texture-unit exhaustion; a `getGlSceneCapabilities` probe and graceful per-feature degradation (e.g. drop float HDR target → rgba8 with documented loss). Today a missing extension is undefined behavior.
- **Render-test + conformance baselines.** A functional scene per lighting/shadow/IBL/skinning/instancing feature (the `functional-test` skill) with committed screenshot + fingerprint baselines, cross-backend **parity** vs `scene-wgpu` and the software reference, and assertion-ported unit tests. This is the gate that lets the renderer claim authoritative.
- **1:1 Rust parity.** `flighthq-scene-gl` (glow over `render-gl`) and `flighthq-scene-wgpu` mirror every material/light/shadow/IBL path, checked against the `displayobject-skia`-style reference and recorded in the conformance map. The `flighthq-lighting` / `flighthq-types` light-block shape must match the TS std140 layout exactly.

## Sequencing & effort

Recommended order, with the cross-package and design-decision items that must be raised before code:

1. **Multi-light forward path (Bronze) — do first, raise as a coordinated design step.** This touches the authoritative seam (`SceneLights`/`SceneLightBlock` in `@flighthq/types`), the pack step in `@flighthq/render`, and both renderers (`scene-gl` + `scene-wgpu`). It is the highest-leverage change and unblocks every other lit feature. **Cross-package + design decision** — settle the std140 light-block layout and `MAX_FORWARD_LIGHTS` value once, in `@flighthq/types`, with the wgpu sibling and the Rust `flighthq-types` layout in the room. Do not land it in scene-gl unilaterally.
2. **Transparency sort + `uv1` + hemisphere (rest of Bronze).** The sort and `uv1` are local to scene-gl/`ensureGlMeshUpload`/`drawGlScene` and can land right after the light block without further design negotiation. Hemisphere is a one-term addition to the new block. Low effort, high payoff; good momentum step.
3. **IBL (early Silver).** Independent of shadows and unblocks the most visible PBR shortfall. Needs new `@flighthq/types` resources (`EnvironmentResources`, BRDF LUT) and the bake functions; `CubeTexture` upload is a `render-gl` capability (add a `glCubeTexture` upload there, not in scene-gl). Medium-large effort, mostly self-contained once the resource type lands.
4. **Shadow mapping (mid Silver) — the largest single item.** Depends on the multi-light block (per-light shadow refs) and on `render-gl` depth-target pooling (already present). New shadow types in `@flighthq/types`, a depth pre-pass in `@flighthq/render`/scene-gl, and shader-side PCF. **Cross-package design decision** — shadow descriptor shape and atlas strategy must be agreed with `scene-wgpu` and the Rust port up front. High effort.
5. **Skinning/morph + instancing (late Silver).** New vertex semantics in `@flighthq/types` (`joints0`/`weights0`) plus `ensureGlMeshUpload` and per-family vertex-prelude defines. Coordinate the semantic names with `@flighthq/mesh` (which owns `MeshGeometry`/layouts) and `@flighthq/scene` (which owns `SkinnedMesh`). Medium effort each; do skinning before instancing (instancing reuses the per-instance-matrix plumbing).
6. **Transmission refractive path (Silver tail).** Self-contained finish of the existing Phase-5 TODO once the transparency pass (step 2) and a scene-color capture target exist.
7. **Gold tier** is the frontier and should be opened only after Silver baselines exist: clustered lighting, area lights/LTC, advanced shadows, OIT, UBO refactor + stats, capability fallback, render-test/parity gates, and Rust parity. Clustered lighting and the UBO refactor are large architectural moves — schedule them as deliberate passes, not opportunistic edits.

**Standing cross-package constraints** (apply at every tier):

- **`scene-wgpu` is a mirror.** Every shader-family, light-block, shadow, and IBL change must be designed once in the shared header/render layers and implemented in both backends, or the two will diverge. Surface any scene-gl-only shortcut as a parity risk.
- **Types-first.** Each feature's descriptors land in `@flighthq/types` (and, where they are entities, `@flighthq/lighting`/`@flighthq/mesh`/`@flighthq/scene`) before the GL implementation — the header is the design surface and the light layer is already ahead of the renderer.
- **`render-gl` owns GPU plumbing.** Cubemap upload, depth/shadow targets, and instance buffers belong in `render-gl` (the subject-agnostic GPU core), not duplicated in scene-gl.
- **Bundle + opt-in discipline.** Keep every new family/subsystem behind an opt-in `register*`/`enable*` and verify `npm run size` — a user who wants only unlit must still pay for nothing else. Shadows, IBL, skinning, and instancing must each be independently tree-shakable.
- **Importers are a `-formats` neighbor.** glTF/asset parsing (Gold) goes in `@flighthq/scene-formats`/`gltf-formats`, never inside the renderer.

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

> Build `@flighthq/scene-gl` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
