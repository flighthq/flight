# Filename Alignment: @flighthq/effects-wgpu

**Verdict:** Backend-variant package (`*-wgpu`) — the prefix-first rule applies, and every one of the 47 source files satisfies it (`wgpu`-first, then a domain/effect/object name); no findings.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| _(none)_ | All filenames are prefix-first (`wgpu…`) and name an effect domain or render-infra object; no bare, suffix-style, single-function, or generic names. | — |

## Clean

Every source file is `wgpu`-prefixed (prefix-first) and self-describing once the folder is removed. Tests are colocated as `<source>.test.ts`, mirroring each source filename exactly.

Effect leaves (44) — each names a recognized effect domain/object:

- `wgpuBloomEffect.ts`, `wgpuBokehDepthOfFieldEffect.ts`, `wgpuBrightnessContrastEffect.ts`, `wgpuCameraMotionBlurEffect.ts`, `wgpuChannelMixerEffect.ts`, `wgpuChromaticAberrationEffect.ts`, `wgpuColorGradeEffect.ts`, `wgpuCrtEffect.ts`, `wgpuDirectionalBlurEffect.ts`, `wgpuDisplacementEffect.ts`, `wgpuDitherEffect.ts`, `wgpuExposureEffect.ts`, `wgpuFilmGrainEffect.ts`, `wgpuFxaaEffect.ts`, `wgpuGlitchEffect.ts`, `wgpuGodRaysEffect.ts`, `wgpuGrayscaleEffect.ts`, `wgpuHalftoneEffect.ts`, `wgpuHueSaturationEffect.ts`, `wgpuInvertEffect.ts`, `wgpuKuwaharaEffect.ts`, `wgpuLensDirtEffect.ts`, `wgpuLensDistortionEffect.ts`, `wgpuLensFlareEffect.ts`, `wgpuLiftGammaGainEffect.ts`, `wgpuLookupTableGradeEffect.ts`, `wgpuMotionBlurEffect.ts`, `wgpuOutlineEffect.ts`, `wgpuPixelateEffect.ts`, `wgpuPosterizeEffect.ts`, `wgpuRadialBlurEffect.ts`, `wgpuScanlinesEffect.ts`, `wgpuScreenSpaceFogEffect.ts`, `wgpuSepiaEffect.ts`, `wgpuSharpenEffect.ts`, `wgpuSketchEffect.ts`, `wgpuSmaaEffect.ts`, `wgpuSsaoEffect.ts`, `wgpuSsrEffect.ts`, `wgpuTaaEffect.ts`, `wgpuTiltShiftEffect.ts`, `wgpuToneMapEffect.ts`, `wgpuVignetteEffect.ts`, `wgpuWhiteBalanceEffect.ts`

Render-infrastructure objects (3) — each names a concrete object/domain, not a single function:

- `wgpuEffectProgramCache.ts` — the per-effect GPU program cache.
- `wgpuRenderEffectPipeline.ts` — the effect-pipeline object (`create`/`begin`/`end`/`destroy` + velocity-texture setter).
- `wgpuRenderEffectRegistry.ts` — the kind→runner registry (`register`/`get` runner).

Barrel:

- `index.ts` — thin re-export barrel (root `.` entry), no dumping-ground content.
