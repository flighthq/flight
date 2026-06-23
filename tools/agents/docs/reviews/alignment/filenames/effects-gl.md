# Filename Alignment: @flighthq/effects-gl

**Verdict:** Backend-variant package (`-gl`) — the prefix-first `gl<Object>` rule applies, and every source file follows it. Clean: all 41 source files name a domain/object (an effect or an infrastructure object) with the `gl` backend token first; no single-function names, no generic dumping-ground names. The only nit is colocated-test mirroring — six source files have no `<source>.test.ts` sibling.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `glBloomEffect.ts` | No colocated `glBloomEffect.test.ts` (mirroring gap, not a naming issue) | (none — add test) |
| `glExposureEffect.ts` | No colocated `glExposureEffect.test.ts` | (none — add test) |
| `glToneMapEffect.ts` | No colocated `glToneMapEffect.test.ts` | (none — add test) |
| `glEffectProgramCache.ts` | No colocated `glEffectProgramCache.test.ts` | (none — add test) |
| `glRenderEffectPipeline.ts` | No colocated `glRenderEffectPipeline.test.ts` | (none — add test) |
| `glRenderEffectRegistry.ts` | No colocated `glRenderEffectRegistry.test.ts` | (none — add test) |

No filename rename is warranted. The findings above are colocated-test mirroring gaps surfaced incidentally; the source filenames themselves are all compliant.

## Clean

Every source filename is prefix-first `gl`-tokened and names a domain/object, passing the folder-removal test:

- Effects (each names the effect object, `gl`-prefixed): `glBloomEffect`, `glBokehDepthOfFieldEffect`, `glBrightnessContrastEffect`, `glCameraMotionBlurEffect`, `glChannelMixerEffect`, `glChromaticAberrationEffect`, `glColorGradeEffect`, `glCrtEffect`, `glDirectionalBlurEffect`, `glDisplacementEffect`, `glDitherEffect`, `glExposureEffect`, `glFilmGrainEffect`, `glFxaaEffect`, `glGlitchEffect`, `glGodRaysEffect`, `glGrayscaleEffect`, `glHalftoneEffect`, `glHueSaturationEffect`, `glInvertEffect`, `glKuwaharaEffect`, `glLensDirtEffect`, `glLensDistortionEffect`, `glLensFlareEffect`, `glLiftGammaGainEffect`, `glLookupTableGradeEffect`, `glMotionBlurEffect`, `glOutlineEffect`, `glPixelateEffect`, `glPosterizeEffect`, `glRadialBlurEffect`, `glScanlinesEffect`, `glScreenSpaceFogEffect`, `glSepiaEffect`, `glSharpenEffect`, `glSketchEffect`, `glSmaaEffect`, `glSsaoEffect`, `glSsrEffect`, `glTaaEffect`, `glTiltShiftEffect`, `glToneMapEffect`, `glVignetteEffect`, `glWhiteBalanceEffect`.
- Infrastructure (each names the object/domain it owns): `glEffectProgramCache` (program cache), `glRenderEffectPipeline` (pipeline entity), `glRenderEffectRegistry` (runner registry).
- `index.ts` is a thin barrel of `export *` re-exports — not a dumping ground.
- Colocated tests present mirror their source filename exactly (e.g. `glBlurFilter`→`glVignetteEffect.test.ts` pattern), satisfying the `<source>.test.ts` rule.
