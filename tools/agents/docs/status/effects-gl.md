# effects-gl status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source by merging `dist/*.js` (impl + comments) with `dist/*.d.ts` (types), validated against the reconstructed `dist/*.test.js`.

### Recovered

- **`glRenderEffectRegistrar.ts`** — whole module lost from `src/` (present in `dist/`, absent in `src/`). The six-band default-runner registrar for the GL effect set, symmetric with `@flighthq/effects-wgpu`. Recovered functions:
  - `getGlRenderEffectKinds(): ReadonlyArray<string>` — single source of truth (`ALL_GL_EFFECT_KINDS`, 43 kinds, alphabetical) for the kinds wired by the default registrar.
  - `registerAntialiasingGlRenderEffects` (Fxaa, Smaa, Taa)
  - `registerBloomGlRenderEffects` (Bloom, ChromaticAberration, GodRays, LensDirt, LensDistortion, LensFlare, Vignette)
  - `registerBlurGlRenderEffects` (BokehDepthOfField, CameraMotionBlur, DirectionalBlur, MotionBlur, RadialBlur, TiltShift)
  - `registerColorGlRenderEffects` (BrightnessContrast, ChannelMixer, ColorGrade, Exposure, Grayscale, HueSaturation, Invert, LiftGammaGain, LookupTableGrade, Posterize, Sepia, ToneMap, WhiteBalance)
  - `registerColorGradeGlRenderEffects` (legacy four-band alias → `registerColorGlRenderEffects`)
  - `registerDefaultGlRenderEffects` (all six bands)
  - `registerScreenSpaceGlRenderEffects` (Displacement, ScreenSpaceFog, Sharpen, Ssao, Ssr)
  - `registerStandardGlRenderEffects` (alias → `registerDefaultGlRenderEffects`)
  - `registerStylizeGlRenderEffects` (Crt, Dither, FilmGrain, Glitch, Halftone, Kuwahara, Outline, Pixelate, Scanlines, Sketch)
  - Plus `glRenderEffectRegistrar.test.ts` (10 `describe` blocks mirroring exports) and the `export * from './glRenderEffectRegistrar'` line in `index.ts`.
- **`hasGlRenderEffectRunner`** — single exported function missing from the existing `glRenderEffectRegistry.ts` (present in `dist`). Added the function (returns `boolean` sentinel, no throw) plus a `describe('hasGlRenderEffectRunner')` block in the existing `glRenderEffectRegistry.test.ts`. The registrar's tests depend on it.

### Fossils skipped

None. No dist module implemented a dropped/deprecated concept (cacheAsBitmap/scrollRect, OpenFL Loader, Stage setters, Bitmap pixelSnapping, Video smoothing).

### Parked

None. The only type the recovered module imports — `GlRenderState` — already exists in `packages/types/src/GlRenderState.ts`. All 43 runner exports referenced by the registrar are present in `src/`.

### Tests

`npm run test --workspace=packages/effects-gl` — 48 files, 127 tests, all passing.
