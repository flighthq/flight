# Depth Review: @flighthq/effects-wgpu

**Domain**: WebGPU (WGSL) backend for the substrate-agnostic full-screen post-process effects pipeline — bright-pass/bloom, tone mapping, color grading, lens/optical, stylize, distortion, antialiasing, and screen-space (atmospheric) recipes, plus the per-state effect registry, ping-pong pipeline orchestration, and shader-pipeline cache.

**Verdict**: solid — **80/100**

This is the WebGPU realization of the `@flighthq/effects` agnostic effect descriptors, sitting alongside `@flighthq/effects-gl` as the second concrete backend. Judged as "the WebGPU effects backend," it is broad, well-structured, and a faithful 1:1 mirror of the GL backend. It is held back from "authoritative" only by a structural dependency it does not yet have: there is no depth or velocity G-buffer in the WebGPU render path, so an entire class of effects (SSAO, SSR, TAA, motion blur, DoF, fog) ship as color-only stand-ins or outright passthroughs. Those are honestly documented in-source as deferred, but they are real depth gaps for the effects this domain is expected to deliver.

## Present capabilities

Core infrastructure (the part that makes this a pipeline, not a pile of shaders):

- `wgpuRenderEffectRegistry` — per-`WgpuRenderState` `WeakMap` registry (`registerWgpuRenderEffect` / `getWgpuRenderEffectRunner`), opt-in and last-write-wins, so unused recipes tree-shake and algorithms are swappable under the same `kind` key. Correct material-renderer pattern, mirrors `effects-gl`.
- `wgpuRenderEffectPipeline` — `create`/`destroy`/`begin`/`end` plus `setWgpuRenderEffectVelocityTexture`. `begin` renders the scene (cleared to background color, optional `rgba16float` HDR target) into an offscreen target; `end` ping-pongs two pooled scratch targets through the effect list and presents with a replace-blend full-screen copy. Pool-based intermediate target acquire/release is correct and matches the geometry pooling convention.
- `wgpuEffectProgramCache` — per-state keyed cache of compiled `WgpuFilterPipeline`s (fragment WGSL only; shared fullscreen vertex prepended). One compile per key per state, reused each frame. A documented uniform-slot convention every recipe follows.

45 effect runners, each exporting `apply<Name>EffectToWgpu(...)` + `default<Name>EffectRunner`, grouped by the agnostic taxonomy:

- Color/tone: brightnessContrast, exposure, hueSaturation, colorGrade, liftGammaGain, whiteBalance, channelMixer, lookupTableGrade, toneMap, grayscale, sepia, invert, posterize.
- Bloom/optical: bloom (the multi-pass reference recipe — bright-pass → reuses the Tier-1 gaussian blur filter → additive dual-source composite), godRays, lensFlare, lensDirt, lensDistortion, chromaticAberration, vignette, exposure.
- Blur family: directionalBlur, radialBlur, motionBlur, cameraMotionBlur, tiltShift, bokehDepthOfField.
- Stylize: kuwahara, halftone, dither, sketch, outline, pixelate, crt, scanlines, filmGrain, glitch.
- AA: fxaa, smaa, taa.
- Screen-space/atmospheric: ssao, ssr, screenSpaceFog, displacement, sharpen.

Shared scalar math (e.g. `computeBloomBlurRadius`) is pulled from `@flighthq/effects`, so the WGSL backend and the GL backend produce identical parameters from one source — the right division of labor.

## Gaps vs an authoritative effects-backend library

- **No depth/velocity G-buffer (the dominant gap).** The pipeline feeds `sceneDepthTexture: null` and only an optional caller-set velocity texture. As a direct consequence, depth/velocity-driven recipes are not real:
  - `taa` is a literal passthrough copy (no history buffer, no reprojection).
  - `ssao` is a luminance-variation darkening stand-in, not depth/normal-reconstructed occlusion over a sample kernel.
  - `ssr`, `screenSpaceFog`, `motionBlur`/`cameraMotionBlur`, and `bokehDepthOfField` similarly fall back to color-only approximations. This is missing-by-deferral, not missing-by-design — the code comments commit to wiring a sampleable depth attachment and a velocity pass as a follow-up — but until then roughly six of the 45 effects are placeholders. An authoritative real-time effects backend is expected to deliver true SSAO/SSR/TAA.
- **No batch registration helper.** There is no `registerAllWgpuRenderEffects(state)` (or grouped registrants). Callers must import and register each runner individually. This matches `effects-gl` and is consistent with the tree-shaking philosophy, so it is defensible — but a curated "register the standard set" convenience would not hurt grepability and is something a mature library usually offers. (Missing-by-design, borderline.)
- **`smaa` is a reduced-quality AA** (per the approximation note), not the full edge-detection + blend-weight + neighborhood-blend three-pass SMAA. Acceptable as a tier, worth flagging.
- **No HDR/bloom mip-chain.** Bloom is single-radius gaussian on a bright branch; an authoritative bloom typically offers a progressive downsample/upsample mip-chain (Call-of-Duty/Unreal style) for wide, stable glow. The `rgba16float` target plumbing exists, so the foundation is there.
- **No effect-chain validation or auto-format negotiation** beyond the simple `rgba16f` option — fine for the current scope.

None of these are gaps in the _agnostic descriptor surface_ (that lives in `@flighthq/effects`); they are backend-implementation depth gaps, which is exactly what this package owns.

## Naming / API-shape notes

- Naming is exemplary and consistent: `apply<Name>EffectToWgpu` for the imperative entry, `default<Name>EffectRunner` for the registry-shaped runner, `Wgpu` prefix-first per the filename-naming philosophy. Full unabbreviated type words throughout (`setWgpuRenderEffectVelocityTexture`, not `setVelTex`).
- Free-function + entity/runtime style is honored: no classes, pooled targets with explicit acquire/release, per-state caches on `WeakMap` (kept off the public runtime type), `sideEffects: false`, single root export.
- `Readonly<>` is applied to `source`/`effect` params; the `as WgpuRenderTarget` casts to strip `Readonly` before passing to the filter primitives are a small wart but are an accepted backend-internal pattern (consistent with the GL mirror).
- 1:1 file/test colocation; every effect has a `.test.ts`. Index is a thin alphabetized barrel.
- The package is a clean structural twin of `effects-gl`, which is the correct outcome for a backend pair — divergence would be a smell.

## Recommendation

Treat as **solid**, on a clear path to authoritative. The architecture (registry, ping-pong pipeline, program cache, pool discipline, shared scalar math) is mature and the 45-effect surface is complete at the descriptor level. The single thing standing between this and "authoritative" is the deferred **depth + velocity G-buffer** in the WebGPU render path; landing it (sampleable depth attachment + a velocity pass) unlocks real SSAO, SSR, TAA, motion blur, DoF, and depth-fog and would retire six placeholder implementations at once — this should be the top follow-up and is already flagged in-source. Secondary, optional polish: a progressive bloom mip-chain, full three-pass SMAA, and a curated `registerAllWgpuRenderEffects` convenience. No naming or API-shape changes needed.
