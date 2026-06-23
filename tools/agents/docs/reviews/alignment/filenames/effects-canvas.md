# Filename Alignment: @flighthq/effects-canvas

**Verdict:** Backend-variant package (`-canvas`), so the prefix-first rule applies — and it is fully satisfied: all 47 source files are `canvas`-prefixed, each names a specific effect object or an effect-subsystem domain, and every file has a colocated `.test.ts`. No renames required.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

Every file passes the "remove the folder" test: the bare filename states the backend token first (`canvas`) and then the effect object or subsystem domain it covers. No bare/suffix-style names (no `bloomEffect.ts`, no `bloomEffectCanvas.ts`), no single-function filenames, and no generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`, etc.). The non-effect files name real subsystem domains rather than one function:

- `canvasEffectCompositing.ts` — domain: shared Canvas 2D draw/compositing helpers (`drawCanvasEffectPass`, `passthroughCanvasEffectPass`), not a single function.
- `canvasRenderEffectRegistry.ts` — domain: the per-state effect runner registry.
- `canvasRenderEffectPipeline.ts` — domain: the effect pipeline.
- `index.ts` — thin barrel re-export only; not a dumping ground.

## Clean

All source files are correctly named and need no change:

`canvasBloomEffect.ts`, `canvasBokehDepthOfFieldEffect.ts`, `canvasBrightnessContrastEffect.ts`, `canvasCameraMotionBlurEffect.ts`, `canvasChannelMixerEffect.ts`, `canvasChromaticAberrationEffect.ts`, `canvasColorGradeEffect.ts`, `canvasCrtEffect.ts`, `canvasDirectionalBlurEffect.ts`, `canvasDisplacementEffect.ts`, `canvasDitherEffect.ts`, `canvasEffectCompositing.ts`, `canvasExposureEffect.ts`, `canvasFilmGrainEffect.ts`, `canvasFxaaEffect.ts`, `canvasGlitchEffect.ts`, `canvasGodRaysEffect.ts`, `canvasGrayscaleEffect.ts`, `canvasHalftoneEffect.ts`, `canvasHueSaturationEffect.ts`, `canvasInvertEffect.ts`, `canvasKuwaharaEffect.ts`, `canvasLensDirtEffect.ts`, `canvasLensDistortionEffect.ts`, `canvasLensFlareEffect.ts`, `canvasLiftGammaGainEffect.ts`, `canvasLookupTableGradeEffect.ts`, `canvasMotionBlurEffect.ts`, `canvasOutlineEffect.ts`, `canvasPixelateEffect.ts`, `canvasPosterizeEffect.ts`, `canvasRadialBlurEffect.ts`, `canvasRenderEffectPipeline.ts`, `canvasRenderEffectRegistry.ts`, `canvasScanlinesEffect.ts`, `canvasScreenSpaceFogEffect.ts`, `canvasSepiaEffect.ts`, `canvasSharpenEffect.ts`, `canvasSketchEffect.ts`, `canvasSmaaEffect.ts`, `canvasSsaoEffect.ts`, `canvasSsrEffect.ts`, `canvasTaaEffect.ts`, `canvasTiltShiftEffect.ts`, `canvasToneMapEffect.ts`, `canvasVignetteEffect.ts`, `canvasWhiteBalanceEffect.ts`, `index.ts`.

All have a colocated `<source>.test.ts` mirroring the source filename.
