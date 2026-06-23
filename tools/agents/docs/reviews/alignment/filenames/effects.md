# Filename Alignment: @flighthq/effects

**Verdict:** Clean. This is a single-implementation, substrate-agnostic domain package (effect intents + shared recipe math; GPU backends like `effects-gl`/`effects-wgpu` are separate packages), so the no-backend-prefix rule applies — and every source file is correctly named after the effect descriptor object it owns (`bloomEffect.ts` → `BloomEffect`), with tests colocated as `<source>.test.ts`.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

No files were flagged. Notes on why the borderline cases pass:

- Acronym-named files (`fxaaEffect.ts`, `smaaEffect.ts`, `taaEffect.ts`, `ssaoEffect.ts`, `ssrEffect.ts`, `crtEffect.ts`) are industry-canonical effect names, each mapping to a concrete descriptor type (`FxaaEffect`, `SsaoEffect`, …). They name an object, not a single function — acceptable.
- Each `*.ts` holds the effect's `create*Effect` plus any substrate-agnostic recipe math (e.g. `bloomEffect.ts` exports both `createBloomEffect` and `computeBloomBlurRadius`), so these are domain/object files, not one-function files.
- `index.ts` is a thin barrel re-exporting each effect module — not a dumping ground.

## Clean

All 44 source files are descriptive domain/object names:

`bloomEffect.ts`, `bokehDepthOfFieldEffect.ts`, `brightnessContrastEffect.ts`, `cameraMotionBlurEffect.ts`, `channelMixerEffect.ts`, `chromaticAberrationEffect.ts`, `colorGradeEffect.ts`, `crtEffect.ts`, `directionalBlurEffect.ts`, `displacementEffect.ts`, `ditherEffect.ts`, `exposureEffect.ts`, `filmGrainEffect.ts`, `fxaaEffect.ts`, `glitchEffect.ts`, `godRaysEffect.ts`, `grayscaleEffect.ts`, `halftoneEffect.ts`, `hueSaturationEffect.ts`, `invertEffect.ts`, `kuwaharaEffect.ts`, `lensDirtEffect.ts`, `lensDistortionEffect.ts`, `lensFlareEffect.ts`, `liftGammaGainEffect.ts`, `lookupTableGradeEffect.ts`, `motionBlurEffect.ts`, `outlineEffect.ts`, `pixelateEffect.ts`, `posterizeEffect.ts`, `radialBlurEffect.ts`, `scanlinesEffect.ts`, `screenSpaceFogEffect.ts`, `sepiaEffect.ts`, `sharpenEffect.ts`, `sketchEffect.ts`, `smaaEffect.ts`, `ssaoEffect.ts`, `ssrEffect.ts`, `taaEffect.ts`, `tiltShiftEffect.ts`, `toneMapEffect.ts`, `vignetteEffect.ts`, `whiteBalanceEffect.ts`.

Plus `index.ts` (barrel) and the 44 colocated `*.test.ts` files, each mirroring its source filename exactly.
