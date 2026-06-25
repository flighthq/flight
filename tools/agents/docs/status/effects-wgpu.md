# effects-wgpu status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `wgpuRenderEffectRegistrants` from `src/` while its compiled output survived in `dist/`. The dist module proved genuine, compiled work (curated registrant helpers), so it was reconstructed via the camera pattern: impl + verbatim `//` comments from `dist/wgpuRenderEffectRegistrants.js`, types restored from `dist/wgpuRenderEffectRegistrants.d.ts`, tests from `dist/wgpuRenderEffectRegistrants.test.js`.

### Recovered

- `wgpuRenderEffectRegistrants.ts` — curated registrant helpers, one per taxonomy band, each registering its band's default runners under canonical kind keys. The Wgpu mirror of the equivalent effects-gl helpers. Exported (alphabetized):
  - `registerAntialiasingWgpuRenderEffects` — Fxaa, Smaa, Taa.
  - `registerBloomWgpuRenderEffects` — Bloom, ChromaticAberration, GodRays, LensDirt, LensDistortion, LensFlare, Vignette.
  - `registerBlurWgpuRenderEffects` — BokehDepthOfField, CameraMotionBlur, DirectionalBlur, MotionBlur, RadialBlur, TiltShift.
  - `registerColorWgpuRenderEffects` — BrightnessContrast, ChannelMixer, ColorGrade, Exposure, Grayscale, HueSaturation, Invert, LiftGammaGain, LookupTableGrade, Posterize, Sepia, ToneMap, WhiteBalance.
  - `registerScreenSpaceWgpuRenderEffects` — Displacement, ScreenSpaceFog, Sharpen, Ssao, Ssr.
  - `registerStandardWgpuRenderEffects` — composes all bands (45 runners).
  - `registerStylizeWgpuRenderEffects` — Crt, Dither, FilmGrain, Glitch, Halftone, Kuwahara, Outline, Pixelate, Scanlines, Sketch.
- `wgpuRenderEffectRegistrants.test.ts` — one `describe` per exported helper (alphabetized), asserting each runner registers under its kind and `registerStandard` rejects unknown kinds.
- `index.ts` — added `export * from './wgpuRenderEffectRegistrants';` (alphabetized between pipeline and registry).

The imported `WgpuRenderState` type already exists in `@flighthq/types`; all 45 `defaultWgpu*EffectRunner` imports and `registerWgpuRenderEffect`/`getWgpuRenderEffectRunner` resolved against existing `src/`, so no other package needed touching.

### Fossils skipped

None. The only dist module without a `src/` counterpart was `wgpuRenderEffectRegistrants`, and it is genuine functionality (no dropped/deprecated concept).

### Parked

None.

### Test result

`npm run test --workspace=packages/effects-wgpu` — 48 files / 104 tests pass.
