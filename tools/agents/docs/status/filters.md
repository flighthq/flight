# @flighthq/filters status

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/filters` by merging gitignored build output (`dist/<m>.js` impl + comments, `dist/<m>.d.ts` types, `dist/<m>.test.js` tests) back into `src/`. The integration curation had pruned several modules and functions whose compiled output survived in `dist/`.

### Recovered — whole modules

- `bitmapFilterMargin.ts` (+ test) — `getBitmapFilterMargin` and the `BitmapFilterMargin` interface. Per-side pixel-expansion margins for blur/shadow/glow/bevel filters; inner and pixel-transform filters return zero. Interface is defined locally (it is not a cross-package type in the `dist` `.d.ts`).
- `bitmapFilterOps.ts` (+ test) — the filter-ops toolkit: `DEFAULT_FILTER_*` constants (ALPHA/ANGLE/BLUR_X/BLUR_Y/COLOR/DISTANCE/KNOCKOUT/QUALITY/STRENGTH), `cloneBitmapFilter`, `cloneBitmapFilterList`, `copyBitmapFilterInto`, `equalsBitmapFilter`, `equalsBitmapFilterList`, `normalizeBitmapFilter`. `copyBitmapFilterInto` throws on a kind mismatch (a precondition violation / programmer error, consistent with the codebase's "throw only on API misuse" rule).
- `convolutionKernels.ts` (+ test) — kernel builders `createBoxBlurKernel`, `createEdgeDetectKernel`, `createEmbossKernel`, `createGaussianKernel`, `createLaplacianKernel`, `createOutlineKernel`, `createSharpenKernel`, plus `getConvolutionDivisor`, `getSeparableKernelFactors`, `isSeparableKernel`, `normalizeConvolutionKernel`, and the local `ConvolutionKernelData` interface.
- `shadowFilterOffset.ts` (+ test) — `getShadowFilterOffset`, the shared shadow/bevel (dx, dy) offset calculation used by every backend.

### Recovered — functions added to existing modules

- `blurMath.ts` — added `computeGaussianSigmaForBlurRadius` (inverse of the uniform-pass `computeBoxBlurRadius` formula), plus its `describe` block.
- `colorMatrixMath.ts` — the file had been pruned down to only `COLOR_MATRIX_LENGTH`. Restored the full color-matrix math module: `applyColorMatrixToColor`, `concatColorMatrix`, `createBrightnessColorMatrix`, `createChannelMixerColorMatrix`, `createColorBalanceColorMatrix`, `createColorMatrixFromTint`, `createContrastColorMatrix`, `createDesaturateColorMatrix`, `createGrayscaleColorMatrix`, `createHueRotateColorMatrix`, `createIdentityColorMatrix`, `createInvertColorMatrix`, `createLevelsColorMatrix`, `createOpacityColorMatrix`, `createPolaroidColorMatrix`, `createSaturationColorMatrix`, `createSepiaColorMatrix`, `createTechnicolorColorMatrix`, `createVintageColorMatrix`, `createWhiteBalanceColorMatrix`, `multiplyColorMatrix` (plus the doc-block header and the private `clampByte` helper).

All recovered exports were added to `src/index.ts`, kept alphabetized.

### Parked

- `bitmapFilterSerialization.ts` — `enumerateBitmapFilterKinds`, `fromBitmapFilterData`, `toBitmapFilterData`. **Parked: needs `BitmapFilterKind` in `@flighthq/types`.** The compiled `dist/bitmapFilterSerialization.js` imports the `*FilterKind` value constants (`BevelFilterKind`, `BlurFilterKind`, … `SharpenFilterKind`) from `@flighthq/types`. Those constants live in `packages/types/dist/BitmapFilterKind.{js,d.ts}` but the source file `packages/types/src/BitmapFilterKind.ts` was itself pruned and is absent — and the hard boundary for this task forbids editing `@flighthq/types`. Recovering this module would require restoring `BitmapFilterKind` in the types package first (separate review).

### Fossils skipped

None. No recovery candidate implemented a deliberately-dropped concept (cacheAsBitmap, scrollRect, Loader, Stage setters, Bitmap pixelSnapping, Video smoothing/source). Every other dist module had a live `src/` counterpart already.

### Tests

`npm run test --workspace=packages/filters` → 23 files, 235 tests, all passing. `tsc -p tsconfig.json --noEmit` for the package exits clean (test files are included via `"include": ["src"]`).
