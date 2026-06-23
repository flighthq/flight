---
id: shadow
title: '@flighthq/shadow'
type: new-package
target: shadow
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/shadow.md
  - tools/agents/docs/reviews/breadth/rendering-gpu.md
  - tools/agents/docs/reviews/breadth/spatial-3d.md
depends_on: []
updated: 2026-06-23
---

## Summary

Shadow mapping for the 3D scene pipeline — light-space view-projection derivation, shadow-map render targets, the per-light depth (shadow-caster) pass, cascade/atlas packing, the sampler-compare (PCF/PCSS) seam, and the light/material opt-in flags that wire shadows into the shared scene light block.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable shadow: a single directional light casting a hard-edged shadow map over the whole scene, with PCF as the only filter. This fills the single biggest 3D gap (a lit scene that renders unshadowed) and proves the depth-pass → compare-sample loop end to end on both GPU backends.

Types in `@flighthq/types` first:

- `ShadowMap.ts` — `ShadowMap` (entity): `width`, `height`, `lightViewProjection: Matrix4` (the world→light-clip matrix the caster pass renders with and the lit pass samples with), `depthBias`, `normalBias`, `version` (bumps when the matrix or size changes so a backend can skip re-rendering a static shadow). Plain data, no GPU handles.
- `ShadowMapDescriptor.ts` — `ShadowMapDescriptor`: `resolution` (texel size, square), `depthFormat` (`'depth16' | 'depth24' | 'depth32f'`), `filter: ShadowFilterKind` (Bronze: `'hard' | 'pcf'`). The allocation request for a shadow target.
- `ShadowFilterKind.ts` — string ids `HardShadowKind`, `PcfShadowKind` (open union; vendor-prefixed for custom).
- `ShadowCompareSampler.ts` — `ShadowCompareSampler` (entity): `compareFunction` (`'less' | 'less-equal'`), `filter` (`'nearest' | 'linear'` — linear gives free 2×2 hardware PCF). The compare-sampler seam descriptor; GPU cores translate it.
- Extend `SceneLights` to carry the _resolved_ shadow alongside the casting directional: add `directionalShadow: Readonly<ShadowMap> | null` (kept null when the directional does not cast or shadows are disabled). Keeps the existing proving-slice shape; grows with the light block.
- Extend `SceneLightBlock` documentation (no shape break): the packed float layout gains the directional `lightViewProjection` and bias terms behind the existing "grows behind feature defines" note; add `shadowCount: number` (0 or 1 in Bronze).

Functions in `@flighthq/shadow`:

- `createShadowMap(descriptor): ShadowMap` — explicit allocation of the CPU-side shadow descriptor (not the GPU target; see backend functions).
- `createShadowCompareSampler(opts?): ShadowCompareSampler`.
- `setDirectionalShadowLightViewProjection(out: Matrix4, light, sceneBounds: Readonly<Aabb>): void` — derives the light-space orthographic view-projection that tightly fits the scene's world bounds for a directional light. Out-param, alias-safe.
- `prepareSceneShadows(state, scene, camera, lights): SceneShadowList` — the backend-agnostic per-frame shadow prep pass (the shadow analog of `prepareSceneRender`): for each casting light, computes its `lightViewProjection`, collects the shadow-casting meshes, and returns a reusable scratch `SceneShadowList` the backend caster pass consumes. Bronze handles exactly one directional.

Backend realization (in `scene-gl` / `scene-wgpu`, or a `shadow-gl`/`shadow-wgpu` neighbor):

- `createGlShadowTarget(state, descriptor): GlShadowTarget` / `createWgpuShadowTarget(...)` — allocates the depth-only render target (over the existing render-target plumbing, `depth: 'depth-stencil-sampled'`).
- `drawGlSceneShadows(state, shadowList, target)` / `drawWgpuSceneShadows(...)` — renders the caster pass: binds the depth target, draws each caster's positions only with the light VP, no color.
- `bindGlShadowCompareSampler(state, target, sampler, unit)` / WGPU equivalent — binds the depth texture as a compare sampler for the lit pass to sample.
- `destroyGlShadowTarget(target)` / `destroyWgpuShadowTarget(...)` — frees the GPU depth texture/framebuffer (`destroy*`, not `dispose*`, since it owns a non-GC resource).

Opt-in (already present): `DirectionalLight.castsShadow`/`shadowBias`/`normalBias`/`pcfRadius` drive the pass. A `receivesShadow` material flag is added in Silver (Bronze: every lit surface receives).

### Silver

Competitive and solid: cascaded shadow maps for directionals, spot and point shadows, a proper filter family, per-material receive opt-out, and cross-backend consistency. This is what a well-regarded engine's shadow layer (three.js `WebGLShadowMap`, Babylon `ShadowGenerator`/`CascadedShadowGenerator`) offers for common professional use.

Types (`@flighthq/types`):

- `CascadedShadowMap.ts` — `CascadedShadowMap`: `cascadeCount` (1–4), `cascades: ReadonlyArray<ShadowCascade>`, `splitLambda` (logarithmic↔uniform split blend), `stabilize` (boolean — texel-snapping to kill cascade shimmer), `fadeRange`. `ShadowCascade`: `splitNear`, `splitFar`, `lightViewProjection: Matrix4`, `atlasRect: Readonly<Rectangle>`.
- `ShadowAtlas.ts` — `ShadowAtlas`: `width`, `height`, `slots: ReadonlyArray<ShadowAtlasSlot>` — one shared texture packing every shadow (cascades, spots, point-cube faces) so the lit pass binds _one_ depth texture, not N.
- `SpotShadowMap.ts` — perspective light-space VP from the spot cone (fovY = 2·outer half-angle, aspect 1, near/far from `range`).
- `PointShadowMap.ts` — six-face cube (or paraboloid; see Open questions) descriptor; carries `faceViewProjections: ReadonlyArray<Matrix4>` (length 6) and a far-plane distance for linear depth.
- `ShadowFilterKind` grows: `Pcf3x3ShadowKind`, `Pcf5x5ShadowKind`, `PcfPoissonShadowKind`, `VarianceShadowKind` (VSM). `ShadowMapDescriptor` gains `filterKernelSize`, `poissonSampleCount`.
- `HasShadowReceive.ts` — material-feature mixin: `receivesShadow: boolean` (default true). Materials opt out (skybox, unlit, emissive) without a central material edit.
- `SceneLightBlock` packed layout grows to the full forward set: per-light shadow index into the atlas, cascade split distances, and bias terms — still one flat `data` buffer behind feature defines, `shadowCount` up to `MAX_FORWARD_SHADOWS`.

Functions (`@flighthq/shadow`):

- `createCascadedShadowMap(opts): CascadedShadowMap`, `createShadowAtlas(opts): ShadowAtlas`, `createSpotShadowMap(...)`, `createPointShadowMap(...)`.
- `computeShadowCascadeSplits(out: Float32Array, near, far, count, lambda): void` — practical-split-scheme (log↔uniform blend) split distances. Out-param.
- `fitShadowCascadeToFrustum(out: ShadowCascade, light, camera, splitNear, splitFar, stabilize): void` — fits each cascade's ortho light-VP to the view frustum slice's world-space corners, with optional texel snapping for stability. Alias-safe.
- `setSpotShadowLightViewProjection(out: Matrix4, spot): void`, `setPointShadowFaceViewProjections(out: Matrix4[], point): void`.
- `packShadowAtlas(out: ShadowAtlas, requests): void` — packs N shadow requests (cascades + spots + point faces) into atlas slots (shelf/skyline packer); `getShadowAtlasSlot(atlas, index)` (sentinel `null` on miss).
- `selectShadowCascade(camera, cascades, viewDepth): number` — which cascade a given view depth falls in (`-1` if beyond the last). The CPU side of the shader's cascade-select.
- `isLightCastingShadow(light): boolean`, `isMeshReceivingShadow(material): boolean` (sentinel-style boolean predicates).
- Signals (opt-in, owning-package rule): `enableShadowMapSignals(map)` → `ShadowMapSignals` (`onShadowMapResized`, `onCascadeSplitChanged`) for tools/debug HUDs. Inert until enabled.

Backend realization additions:

- Cascade/atlas caster pass: `drawGlSceneShadowAtlas(state, shadowList, atlas, target)` (one target, per-slot viewport scissor) + WGPU equivalent.
- Point-light cube/paraboloid depth pass; spot perspective depth pass.
- PCF kernel + Poisson + VSM filter realization in the lit-pass material shaders (define-key permutation, matching the existing per-material program permutation in `scene-gl`/`scene-wgpu`).
- A shared `bindSceneShadowAtlas(state, atlas, ...)` so every mesh material binds the same compare sampler + atlas in the lit pass.
- Cross-backend consistency contract: documented bias/depth-format/compare-function mapping identical across GL/WGPU/skia, verified by parity cells; texel-snap stabilization deterministic across backends.

### Gold

Authoritative / AAA: the canonical shadow cell. Soft contact-hardening shadows, the full filter taxonomy, performance (caching, culling, update budgets), exhaustive edge-case/error handling, and 1:1 Rust parity with a deterministic software reference.

Types (`@flighthq/types`):

- `ShadowFilterKind` complete: `PcssShadowKind` (percentage-closer _soft_ shadows — penumbra from blocker search), `EsmShadowKind` (exponential), `MsmShadowKind` (moment, 4-moment), `VsmShadowKind` already in Silver. `ShadowSoftness` descriptor: `lightSizeWorld`, `blockerSearchRadius`, `penumbraScale`.
- `ShadowMapUpdatePolicy` — `'every-frame' | 'on-change' | 'cached'` + `staleAfterFrames`; static-shadow caching so unchanged casters/lights skip the depth pass (the `version` field's payoff).
- `ShadowCullPolicy` — caster-frustum culling against the light's frustum, and a `maxShadowDistance` / `shadowFadeStart` for distance fade-out.
- `ShadowBiasPolicy` — `'constant' | 'slope-scaled' | 'normal-offset' | 'receiver-plane'`, with the depth-bias + normal-bias terms; receiver-plane depth bias for the highest-quality acne/peter-pan tradeoff.
- `ShadowDebugView` — `'cascades' | 'depth' | 'overdraw' | 'atlas'` for the debug-draw overlay.
- `ContactShadow` / `ScreenSpaceShadow` descriptor (SSS ray-march in screen space for contact hardening, layered on top of map shadows) — see Open questions on whether this belongs here or in an effects neighbor.

Functions (`@flighthq/shadow`):

- `prepareSceneShadows` grows to the full set: every casting directional (cascaded) + spots + points, atlas-packed, with per-light update policy and caster culling honored; returns the complete `SceneShadowList`.
- `computeShadowAtlasBudget(lights, resolution, maxTexels): ShadowAtlasBudget` — distributes a fixed atlas-texel budget across lights by importance (cascade > spot > point), so a frame never blows the shadow VRAM cap; `getShadowMapResolutionForLight(...)`.
- `computePcssBlockerSearch(...)` / `computePcssPenumbraSize(...)` CPU reference helpers (the shader mirrors them) for the software/conformance path.
- `shouldUpdateShadowMap(map, policy, frameState): boolean` — drives the caching skip.
- `cullShadowCasters(out, casters, lightFrustum): void` — per-light caster cull; `expandShadowCasterBounds(...)` for off-frustum casters whose shadows still enter view (the "pancaking" near-plane extension).
- Full bias-policy application: `applyShadowBiasPolicy(out, policy, light, cascade): void`.
- `dispose*` for any shadow entity that registers signals; `destroy*` for every GPU-backed shadow target.

Backend realization (Gold):

- PCSS / ESM / MSM filter shaders on both GPU backends; contact/screen-space shadow pass.
- Reverse-Z and 32-bit float depth path for large-range directional shadows; `depthClamp` / front-face vs back-face culling caster-pass options to fight acne.
- Multi-tap Poisson with per-cascade kernel scaling; blue-noise rotation for temporal stability; optional TAA-aware jittered shadow sampling that pairs with the existing `setCameraJitter` TAA hook.
- WGPU compute-assisted shadow blur (VSM/ESM separable blur in compute) — pairs with the compute seam the rendering-gpu review also wants; degrades to fragment-pass blur where compute is absent.
- `displayobject-skia` software shadow reference (deterministic, bit-exact) as the conformance reference the GPU backends are checked against.

Quality bar:

- Exhaustive colocated tests (one `*.test.ts` per source; alias-safe `out` cases for every matrix/cascade-fit function; cascade-split boundary cases; degenerate scene-bounds and zero-caster frames returning sentinels not throwing).
- Functional/parity scenes: `shadow-directional`, `shadow-cascade`, `shadow-spot`, `shadow-point`, `shadow-pcss` under `tests/functional/` (TS) paired by name with `flighthq-functional` Rust scenes; baselines blessed for wgpu and the skia reference.
- `flighthq-shadow` Rust crate passing the value-typed conformance cells (cascade splits, light-space matrices, atlas packing are deterministic) and the render parity cells.
- Docs: the bias/acne/peter-panning tradeoff guide, the cascade-tuning guide, and the per-backend divergence map entry (depth-format / compare-function differences recorded, not silently differing).

## Boundaries

- **Light _data_ stays in `@flighthq/lighting`.** This package consumes `DirectionalLight`/`SpotLight`/`PointLight` and their existing shadow params; it does not own light color/intensity/placement. The opt-in flags (`castsShadow`, biases, `pcfRadius`) already live on the light descriptors and stay there.
- **The shared light-block _pack_ and scene prep stay in `@flighthq/render`.** `packSceneLightBlock` / `prepareSceneRender` remain the owners of the per-frame light block; `prepareSceneShadows` is a _sibling_ prep pass that produces the shadow data the block references, not a rewrite of the light pack. (Whether the two prep passes merge is an Open question.)
- **The GPU draw and shader permutation stay in `scene-gl` / `scene-wgpu`.** `@flighthq/shadow` is backend-agnostic math + descriptors + the compare-sampler seam; it never imports a GL/WGPU context. The caster-pass draw, atlas viewport scissoring, and the lit-pass filter shaders are backend realizations.
- **Generic render targets and pooling stay in `@flighthq/render` + the GPU cores.** Shadow targets are allocated _over_ the existing `RenderTargetDescriptor` / pool plumbing (`depth: 'depth-stencil-sampled'`), not a parallel target system.
- **Camera/frustum/AABB math stays in `@flighthq/geometry`/`@flighthq/camera`.** Cascade fitting _uses_ frustum-corner and ortho/perspective matrix helpers from there; it does not reimplement them.
- **Sampler/texture _value types_ stay in `@flighthq/texture`.** The `ShadowCompareSampler` is shadow-specific (carries `compareFunction`), but the generic `Sampler`/`Texture`/wrap/filter vocabulary it aligns with is owned by `texture`.
- **Baked / lightmap shadows are out** — that is an offline/asset-pipeline concern (a future `lightmap` / asset-bake cell), not real-time shadow mapping.
- **2D drop-shadow filters are unrelated** — `DropShadowFilter`/`InnerShadowFilter` in `@flighthq/filters` are per-display-object image effects, a different domain. `@flighthq/shadow` is exclusively 3D scene shadow mapping; the name collision is acceptable because the packages never co-occur in a 2D bundle and the verbs differ (`Filter` vs `ShadowMap`).
- **IBL/environment shadowing (ambient occlusion from the environment) is out** — that belongs with the requested `environment`/IBL realization. SSAO already exists as a post effect; analytic AO is a separate concern.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **One package or a `shadow` core + `shadow-gl`/`shadow-wgpu` neighbors?** The render stack splits backend-agnostic core from per-backend realization (`render` → `render-gl`/`render-wgpu`). Shadow could follow that exactly (core `shadow`, neighbor `shadow-gl`/`shadow-wgpu`), or fold the realization into the existing `scene-gl`/`scene-wgpu` (since shadows are part of the scene draw). Lean: keep the **math/descriptors in `@flighthq/shadow`** and put the **realization in `scene-gl`/`scene-wgpu`** (no new backend packages), since the caster pass is just another scene draw over the same programs. Confirm before building.
- **Point-light shadows: cube map vs dual-paraboloid.** Cube (6 faces) is the standard, correct, and atlas-packs as 6 slots; dual-paraboloid (2 slots) is cheaper but distortion-prone. Lean cube for correctness/conformance; decide whether paraboloid is ever offered.
- **Does `prepareSceneShadows` merge into `prepareSceneRender`?** A unified prep pass walks the scene once (caster collection + visible-mesh collection share the walk) but couples `render` to `shadow`. Keeping them separate preserves tree-shaking (no-shadow apps never call the shadow prep) at the cost of a second scene walk. Lean: separate passes, but expose a combined `prepareSceneRenderWithShadows` convenience that calls both. Confirm.
- **Atlas vs per-light targets.** A single shared atlas means the lit pass binds one depth texture (essential past a few shadows and required for one-draw forward+); per-light targets are simpler for Bronze. Lean: per-light in Bronze, atlas from Silver. Confirm the Bronze→Silver migration does not break the `SceneLightBlock` layout.
- **Filter default.** three.js defaults to PCF-soft; is `PcfShadowKind` (3×3) the right Bronze default, or hard? Lean PCF (hard shadows read as broken to most users), accepting the slightly higher Bronze cost.
- **Reverse-Z by default?** Reverse-Z dramatically improves directional-shadow precision but interacts with the existing depth-format/compare convention and the color/depth conventions documented for cross-backend conformance. Decide whether Gold flips the whole depth convention or keeps reverse-Z shadow-local.
- **Screen-space contact shadows: here or an effects neighbor?** SSS is a screen-space ray-march (more like the post-effect family) than a shadow-map technique. It pairs with map shadows for contact hardening but could live in `effects`. Lean: keep map shadows here; SSS as a Gold extension flagged for possible relocation.
- **Does `receivesShadow` belong as a material-feature mixin (`HasShadowReceive`) or a per-node render flag?** A mixin keeps it serializable per material (skybox/unlit opt out by kind); a node flag allows per-instance control. Lean material mixin (matches the `HasMaterial` pattern), with a node override considered if instancing needs it.
- **MAX_FORWARD_SHADOWS cap.** Forward shadowing has a hard per-draw shadow-count ceiling (uniform/sampler limits). Decide the cap (e.g. 1 cascaded directional + N spot/point), and whether exceeding it is a clustered/tiled forward+ concern deferred past Gold.

## Agent brief

> Create `@flighthq/shadow` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
