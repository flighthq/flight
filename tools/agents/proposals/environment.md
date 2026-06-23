---
id: environment
title: '@flighthq/environment'
type: new-package
target: environment
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/environment.md
  - tools/agents/docs/reviews/breadth/rendering-gpu.md
  - tools/agents/docs/reviews/breadth/spatial-3d.md
depends_on: []
updated: 2026-06-23
---

## Summary

Image-based lighting and skybox: equirect/HDR→cubemap conversion, irradiance + prefiltered-specular + BRDF-LUT bake, and skybox draw — the runtime that backs the existing `Environment` material/light type so PBR materials gain ambient specular IBL instead of direct-lighting-only.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that turns `Environment` from inert data into visible IBL + a sky. Types land in `@flighthq/types` first.

- **Types (`@flighthq/types`).**
  - `EnvironmentCubemap` — value type wrapping the baked specular-radiance `CubeTexture` plus its mip count (the prefilter chain lives in the mips).
  - `IrradianceCubemap` — the diffuse-irradiance `CubeTexture` (low-res, e.g. 32²).
  - `BrdfLut` — the split-sum BRDF lookup `Texture` (2-channel, e.g. 512²).
  - `EnvironmentIblSet` — `{ environment, irradiance, specular, brdfLut, mipCount }`: the full baked set a PBR draw binds.
  - `EquirectToCubemapDescriptor` — `{ source: ImageSource, faceSize, colorSpace }`.
  - `EnvironmentBakeDescriptor` — `{ irradianceSize, specularBaseSize, specularSampleCount, brdfLutSize }` with sane defaults.
  - `SkyboxDescriptor` — `{ environment: CubeTexture, intensity, mipLevel }` (mipLevel for blurred-sky roughness preview).
  - `EnvironmentBakeBackend` interface (bake methods below as the backend contract).
  - `EnvironmentCubemapKind`, `SkyboxKind` string kind identifiers.
- **Bake + convert (`@flighthq/environment`, free functions over the active backend).**
  - `createEnvironmentIblSet(out?)` — allocate an empty IBL set.
  - `convertEquirectToEnvironmentCubemap(descriptor): CubeTexture` — equirect/HDR panorama → radiance cubemap (the missing "cubemap-from-equirect/HDR loader" both reviews call out).
  - `bakeEnvironmentIrradiance(environment, descriptor): IrradianceCubemap` — cosine-weighted diffuse irradiance convolution.
  - `bakeEnvironmentSpecular(environment, descriptor): EnvironmentCubemap` — roughness-mip prefiltered specular (GGX importance sampling, one mip per roughness step).
  - `bakeEnvironmentBrdfLut(descriptor): BrdfLut` — split-sum BRDF integration LUT (view-independent; bake once, reuse).
  - `bakeEnvironmentIblSet(environment, descriptor, out?): EnvironmentIblSet` — the one-call convenience that runs all three bakes.
- **Skybox draw (`@flighthq/environment-gl`, `@flighthq/environment-wgpu`).**
  - `drawGlSkybox(state, descriptor, camera)` / `drawWgpuSkybox(...)` — cubemap sky on a fullscreen/cube pass at far depth, using the camera's inverse view-rotation; the "skybox draw entry point" both reviews say is missing.
  - `registerGlEnvironmentBakeBackend(state)` / `registerWgpuEnvironmentBakeBackend(state)` — opt-in registration (no top-level side effects), wiring `setEnvironmentBakeBackend`.
- **PBR consumption.** `scene-gl` / `scene-wgpu` PBR prelude extended to sample `EnvironmentIblSet` (irradiance for diffuse ambient, specular mip chain + BRDF LUT for ambient specular), replacing the flat-ambient "no IBL specular yet" path.

### Silver

Competitive with a well-regarded IBL toolkit; covers professional content and cross-backend consistency.

- **Color / HDR correctness.**
  - `environment-formats`: `decodeRadianceHdr(bytes): ImageSource` (RGBE), `decodeOpenExr(bytes): ImageSource`; `EnvironmentHdrEncoding` kind so non-float backends can fall back to RGBM/RGBE-packed cubemaps.
  - HDR cubemap formats: `rgba16float` faces where the backend supports them, with a documented RGBM fallback path (ties into the renderer review's "no `rgba16float` HDR target format" gap).
  - `convertCubemapToEquirect(cubemap): ImageSource` — round-trip for tooling/debug capture.
- **Bake quality controls.**
  - `EnvironmentBakeQuality` kind (`'draft' | 'standard' | 'high'`) presets feeding sample counts/sizes.
  - `bakeEnvironmentSpecular` mip prefilter with **mip-level sample-count falloff** and **solid-angle / mip-bias source sampling** to kill fireflies (the standard production GGX prefilter refinement).
  - Charlie/sheen environment term: `bakeEnvironmentSheenIrradiance` to back the existing sheen PBR material under IBL.
- **Ambient occlusion + intensity.**
  - `EnvironmentAmbientDescriptor` for ambient-light color/intensity separate from the skybox so a scene can light from IBL while drawing a different (or no) visible sky.
  - Horizon-occlusion specular term in the PBR consumption (standard IBL artifact fix).
- **Procedural / fallback environments.**
  - `createSolidColorEnvironmentCubemap(color)` and `createGradientEnvironmentCubemap(top, horizon, bottom)` — cheap ambient sources with no HDR asset (the common "no environment authored yet" default).
  - `createProceduralSkyEnvironment(descriptor)` — analytic Hosek-Wilkie / Preetham sky model producing an environment cubemap + sun direction (a recognized professional staple).
- **Lifecycle + reuse.**
  - `EnvironmentIblCache` keyed by source `CubeTexture` identity so a bake is reused across frames; `acquireEnvironmentIblSet` / `releaseEnvironmentIblSet` pool brackets for the transient bake render targets.
  - `disposeEnvironmentIblSet(set)` (release-to-GC of references) and `destroyEnvironmentIblSet(state, set)` (free GPU textures now) — distinct per the teardown-verb rule.
- **Skybox variants.** `drawGlEquirectSkybox` (sample an equirect texture directly without a cubemap pre-convert) and a rotation parameter (`environmentRotationY`) shared between sky draw and IBL sampling so the lighting and the visible sky stay locked together.
- **Cross-backend parity.** Functional/parity test scenes (`environment-skybox`, `environment-ibl-spheres`) comparing GL ↔ WGPU ↔ the CPU `surface` reference bake, under the existing parity matrix.

### Gold

The canonical reference for IBL in this SDK. Exhaustive, performant, fully tested, Rust-parity.

- **Full bake pipeline.**
  - Real-time / dynamic IBL: `bakeEnvironmentIblSetIncremental` that spreads the specular mip + irradiance bake across frames (`EnvironmentBakeBudget`) for dynamic skies and reflection probes.
  - `EnvironmentReflectionProbe` type + `bakeEnvironmentReflectionProbe(state, scene, position)` — render the scene into a cube and bake it, the natural extension of skybox IBL to local reflections (positioned probes, parallax-corrected box bounds via `EnvironmentProbeBounds`).
  - `bakeEnvironmentBrdfLutMultiscatter` — multi-scatter energy-compensation LUT (the modern split-sum refinement) plus the matching PBR consumption term.
  - Spherical-harmonics path: `bakeEnvironmentSphericalHarmonics(environment): SphericalHarmonicsL2` (9-coefficient diffuse irradiance) as a cheaper alternative to the irradiance cubemap, with `evaluateSphericalHarmonicsIrradiance` and a PBR consumption variant — the production diffuse-IBL standard.
- **Compute path.** `environment-wgpu` bakes via compute (the renderer review's missing "WebGPU compute seam" surfaces here first): `dispatchWgpuEnvironmentPrefilter` etc., with the fragment-pass path retained as the GL fallback. Prefilter/irradiance are the canonical compute workloads.
- **Performance.** Mip-chain reuse across probes, async readback-free bakes, a single combined irradiance+specular pass option, and `npm run size` discipline keeping descriptors out of the default bundle (bake code only enters via the `-gl`/`-wgpu` packages).
- **Error handling + sentinels.** Every convert/bake returns `null` for expected failure (unsupported face format, zero-size source, missing backend) and throws only on misuse (negative sizes, mismatched face counts). `hasEnvironmentBakeBackend()` / `getEnvironmentBakeBackend()` return-or-`null`. Backend-capability query `getEnvironmentBakeCapabilities(state)` reporting float-format / compute support so callers can pick quality.
- **Tooling + debug.** `drawGlEnvironmentMipDebug` (visualize the prefiltered roughness chain), `captureEnvironmentCubemapToSurface` for golden-image conformance, and a documented intensity/exposure interaction with the `effects` tonemap chain.
- **Signals.** `enableEnvironmentBakeSignals(state)` exposing `onEnvironmentBakeComplete` for incremental/probe bakes (multi-listener, opt-in cost per the signals rule).
- **Tests + docs.** Colocated `*.test.ts` per source file (alias-safe `out` cases for the IBL-set builders), parity + regression baselines for skybox and IBL-lit spheres across GL/WGPU/surface, and an `environment` domain doc under `tools/agents/docs/`.
- **Rust parity.** `flighthq-environment` (+ `-formats`) 1:1 with the TS surface; rustybuzz is irrelevant here, but the rusty-radiance/EXR decode and the wgpu compute prefilter are the native production path; the `surface-rs`/tiny-skia CPU bake is the bit-deterministic conformance reference, recorded in the conformance/divergence map.

## Boundaries

- **The `Environment` light/material type and its `createEnvironment` constructor stay in `@flighthq/types` + `@flighthq/lighting`.** This package backs that type with a runtime; it does not re-own the data.
- **`CubeTexture`, `Texture`, `Sampler` value types stay in `@flighthq/texture`.** Environment produces and consumes them but does not redefine them.
- **The PBR shaders stay in `scene-gl` / `scene-wgpu`.** Environment supplies the baked `EnvironmentIblSet` and the sampling helpers; the per-material prelude that consumes them belongs to the scene renderers.
- **HDR file decoding lives in `environment-formats`**, not the core package — same parser-split rule as `particles-formats`.
- **Tonemapping / exposure / bloom stay in `effects`.** Environment outputs linear HDR radiance; the display-side tonemap chain is a separate cell. The HDR-target-format work it implies is shared with (and tracked under) the renderer-review HDR-pipeline gap, not solved twice.
- **General render targets / framebuffer pooling stay in `render-gl` / `render-wgpu`.** Environment uses the existing target primitives for its transient bake passes.
- **Reflection probes' scene render reuses `scene-gl` / `scene-wgpu` draw**; environment owns only the cube-capture orchestration and the subsequent bake, not a second scene renderer.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Bake-time vs. real-time placement.** Should the one-shot bake (`bakeEnvironmentIblSet`) and the dynamic/incremental + reflection-probe path live in the same package, or should probes/dynamic IBL be a `environment-probe` neighbor? Leaning: one package, gated by tree-shaking (incremental + probe code only pulled if referenced).
- **SH vs. irradiance-cubemap as the default diffuse path.** Both are offered at Gold; which is the _default_ the PBR prelude consumes? SH is cheaper and the modern default, but the irradiance cubemap is simpler to validate against the CPU reference. Possibly select via `EnvironmentBakeDescriptor`.
- **HDR storage on backends without float-renderable cubemaps** (notably some WebGL2 contexts): RGBM vs. RGBE vs. half-float — and whether the encoding is a public `EnvironmentHdrEncoding` kind the caller picks or an internal backend-capability decision. This couples to the renderer-review HDR-target-format question and should be resolved jointly.
- **Where `environmentRotationY` lives.** Is sky/IBL rotation a field on the `Environment` light type (shared, authored data) or a draw-time `SkyboxDescriptor` parameter? Putting it on the light keeps sky and lighting locked but widens the `@flighthq/types` `Environment` shape.
- **Backend seam granularity.** One `EnvironmentBakeBackend` covering all three bakes + skybox draw, or separate `setEnvironmentSkyboxBackend` from the bake backend? A single backend is simpler; splitting lets a host draw sky without pulling in bake code.
- **CPU `surface` bake scope.** Should the `surface` reference path implement the _full_ GGX prefilter (slow but bit-deterministic and the conformance reference) or only irradiance + a low-res specular, with high-res specular GPU-only? Affects how much of the Rust↔TS conformance matrix the CPU cells can cover.

## Agent brief

> Create `@flighthq/environment` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
