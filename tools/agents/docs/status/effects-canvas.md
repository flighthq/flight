# effects-canvas — status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/effects-canvas` by merging gitignored `dist/*.js` (implementation + verbatim `//` comments) with `dist/*.d.ts` (types), following the camera pattern.

### Recovered

- **`canvasRenderEffectRegistration.ts`** (whole module, new file) — the opt-in standard-set registrar. Exported functions: `registerAllCanvasRenderEffects`, `registerBlurCanvasRenderEffects`, `registerColorGradeCanvasRenderEffects`, `registerScreenSpaceCanvasRenderEffects`, `registerStylizeCanvasRenderEffects`, with the four module-level `*_CANVAS_EFFECT_KINDS` tables at the bottom. Reconstructed `canvasRenderEffectRegistration.test.ts` from `dist`, omitting the two tests that depend on `CANVAS_RENDER_EFFECT_SUPPORT` (parked — see below); all other tests kept. Added `export * from './canvasRenderEffectRegistration'` to `src/index.ts` (alphabetized; matches the built `dist/index.js`, which re-exported it).
- **`canvasEffectCompositing.ts`** — added two missing exported functions into the existing file: `drawCanvasAccumulationPass` (accumulation primitive behind directional/radial/motion blur and god-rays) and `drawCanvasImageDataPass` (per-pixel getImageData/putImageData pass primitive). Added their reconstructed tests (incl. the `makeTarget` fixture) to the existing test file.
- **`canvasRenderEffectRegistry.ts`** — added the missing exported function `hasCanvasRenderEffectRunner` and its reconstructed `describe` block.

### Parked

- **`CANVAS_RENDER_EFFECT_SUPPORT`** and **`getCanvasRenderEffectSupport`** (from `canvasRenderEffectRegistry`) — both annotate/return type `CanvasRenderEffectSupport`, which is NOT present in `@flighthq/types` (no `CanvasRenderEffectSupport.ts`, no definition anywhere in `packages/types/src/`). Recovering them would require editing `@flighthq/types`, which is outside the hard boundary. Parked with reason "needs type `CanvasRenderEffectSupport` in @flighthq/types". Consequence: the two registration tests that iterate `CANVAS_RENDER_EFFECT_SUPPORT` were also omitted from the recovered registration test (they depend on the parked symbol).

### Fossils skipped

- None. No recovery candidate implemented a deliberately-dropped/deprecated concept.

### Test result

`npm run test --workspace=packages/effects-canvas`: 48 files passed, 128 tests passed.
