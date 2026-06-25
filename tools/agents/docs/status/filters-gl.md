# filters-gl status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/filters-gl` by merging gitignored `dist/` build output (`*.js` impl + comments, `*.d.ts` types, `*.test.js` tests) back into `src/`.

### Recovered

- **`glScratchCount.ts`** — the scratch-render-target count helper family (13 free functions): `getBevelFilterGlScratchCount`, `getColorMatrixFilterGlScratchCount`, `getConvolutionFilterGlScratchCount`, `getDisplacementMapFilterGlScratchCount`, `getDropShadowFilterGlScratchCount`, `getGradientBevelFilterGlScratchCount`, `getGradientGlowFilterGlScratchCount`, `getInnerGlowFilterGlScratchCount`, `getInnerShadowFilterGlScratchCount`, `getMedianFilterGlScratchCount`, `getOuterGlowFilterGlScratchCount`, `getPixelateFilterGlScratchCount`, `getSharpenFilterGlScratchCount`. Each returns the number of scratch targets a caller must allocate before invoking the corresponding `apply*FilterToGl` (3 for the multi-pass blur/shadow/glow/bevel filters, 2 for sharpen, 0 for the single-pass color-matrix/convolution/displacement/median/pixelate filters). Self-contained constant returns with no internal dependencies — recovered verbatim from `dist/glScratchCount.js` + `.d.ts`, with the colocated test reconstructed from `dist/glScratchCount.test.js`. Added the 13-name `export` block to `src/index.ts` (alphabetized between `glPixelateFilter` and `glSharpenFilter`). Types referenced: none beyond `number`.

### Parked

- **`glFilterProgramCache.ts`** (`clearGlFilterProgramCache`, `INNER_CLIP_FRAGMENT_SRC`, and the 17 per-filter `*Cache` WeakMaps). **Reason: superseded architecture; would fail its own recovered test against current `src/`.** The `dist/` version is the OLD _centralized_ program-cache design — every filter `.js` in `dist/` imported its cache (`blitCache`, `bevelCompositeCache`, `tintCache`, `innerClipCache`, …) and `INNER_CLIP_FRAGMENT_SRC` from this module. The current curated `src/` deliberately moved to _per-file local_ caches with richer location types (e.g. `glBlitShader.ts` declares its own `blitOffsetShaders`/`blitShaders` WeakMaps typed `BlitOffsetShaderLocations` (a `GlFullscreenProgram & { locOffset }`), and `glInnerGlowFilter.ts` declares its own `INNER_CLIP_FRAGMENT_SRC` + `clipShaders`). Recovering `glFilterProgramCache.ts` as-is would create WeakMaps that **no current filter writes to**, so `clearGlFilterProgramCache` would clear empty maps. The recovered test (`dist/glFilterProgramCache.test.js`) primes `tintCache` by calling `applyGlTintPass(...)` then asserts `tintCache.has(state)` — but current `glTintShader.ts` writes to its own local `tintShaders` map, so that assertion would be `false` and the test would fail. Faithful recovery would require reverting the per-filter local-cache refactor across ~15 filter files (re-wiring them to import from this module) — a large architectural revert that conflicts with the deliberately evolved current design and exceeds the merge-`.js`+`.d.ts` recovery pattern. Per the recovery rule ("if a failure needs a judgment, revert that module and PARK it"), this is parked for a design decision: either keep per-file caches (and re-home `clearGlFilterProgramCache` as a thin module that imports each file's exported cache), or restore the centralized design. The package docs (charter / review / assessment / status) still reference `clearGlFilterProgramCache` as intended surface, and there is an open North-star question about its `dispose` vs `destroy` semantics — both point to this being a design fork, not a mechanical recovery.

### Fossils skipped

None. Neither lost dist module implements a deliberately-dropped concept (cacheAsBitmap, scrollRect, Loader, Stage setters, Bitmap pixelSnapping, Video smoothing). Both are genuine GPU-filter functionality; the parked one is parked for architectural conflict, not because it is a dropped concept.

### Test result

`npm run test --workspace=packages/filters-gl` — **19 test files passed, 74 tests passed** (includes the new `glScratchCount.test.ts`).
