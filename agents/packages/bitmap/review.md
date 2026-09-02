---
package: '@flighthq/bitmap'
status: solid
score: 85
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source (all 45 src/*.ts, all 44 src/*.test.ts)
  - package.json
  - @flighthq/types BitmapConvolutionOptions, BitmapEdgeMode, GradientSpread
---

# bitmap -- Review

## Verdict

`solid -- 85/100.` A comprehensive CPU pixel-manipulation library with 114 public exports across 45 source files covering lifecycle, pixel access, compositing, geometric transforms, blur/sharpen, convolution, filters, color manipulation, alpha/channel/format ops, fill/generate, crop/extend, analysis, and fingerprinting. The API is consistent, well-named, and tested one-file-per-source. The remaining gap to `authoritative` is a set of module-level mutable scratch buffers that contradict the charter's North star, a few internal code duplications, and the displacement map's dual edge-mode vocabulary.

## Present capabilities

Grounded in source; every claim names its file.

**Lifecycle** (`bitmap.ts`): `createBitmap`, `cloneBitmap`, `invalidateBitmap`, `convertBitmapAlphaType`. Bitmaps are entities via `createEntity`; `version` field tracks invalidation. Alpha conversion between `'straight'` and `'premultiplied'` is in-place with metadata update.

**Region ops** (`bitmapRegion.ts`): `createBitmapRegion`, `setBitmapRegion`. Regions are plain `{bitmap, x, y, width, height}` objects; `setBitmapRegion` mutates in place for hot-loop reuse.

**Pixel access** (`bitmapPixel.ts`): `getBitmapPixel`, `getBitmapPixelChannel`, `getBitmapPixelLuminance`, `getBitmapPixelRgb`, `setBitmapPixel`, `setBitmapPixelRgb`. Packed RGBA `0xRRGGBBAA`.

**Pixel copy/composite** (`bitmapComposite.ts`, `bitmapCopy.ts`): `compositeBitmapPixels`, `compositeBitmapRegion` with full `BitmapCompositeMode` enum (15 blend modes + 10 Porter-Duff operators); `copyBitmapPixels`; bulk `extractBitmapPixels` / `extractBitmapPixels32`, `writeBitmapPixels` / `writeBitmapPixels32`.

**Geometric transforms**: `resizeBitmap` (`bitmapResize.ts`) with nearest/bilinear/bicubic and `BitmapEdgeMode`/premultiplied-aware; `rotateBitmap` arbitrary-angle, `rotateBitmap180`/`Clockwise`/`CounterClockwise` (`bitmapRotate.ts`); `transformBitmap` affine 2x3 (`bitmapAffine.ts`); `warpBitmap` projective 3x3 and `warpBitmapQuad` four-corner homography (`bitmapWarp.ts`); `flipBitmapHorizontal`/`flipBitmapVertical` (`bitmapFlip.ts`); `scrollBitmap` (`bitmapTransform.ts`). All geometric ops accept `BitmapEdgeMode` and `BitmapResizeMode` (the unified sampling contract).

**Blur/sharpen** (`bitmapBlur.ts`, `bitmapSharpen.ts`): `boxBlurBitmap` (separable H+V, multi-pass), `gaussianBlurBitmap` (weighted kernel, separable), `computeGaussianKernel`, `sharpenBitmap` (unsharp mask). Low-level primitives: `blurBitmapPixelsHorizontal`/`Vertical`, `blurBitmapPixelsHorizontalWeighted`/`VerticalWeighted`.

**Convolution** (`bitmapConvolution.ts`): `convolveBitmap` with arbitrary kernel, divisor, bias, preserveAlpha, unified `BitmapEdgeMode` (clamp/transparent/wrap/mirror).

**Median/morphological** (`bitmapMedian.ts`, `bitmapMorphological.ts`): `medianBitmap` (per-channel median filter); `dilateBitmap`, `erodeBitmap` (radius-box morphology).

**Filters** (`bitmapBevel.ts`, `bitmapShadow.ts`, `bitmapPixelate.ts`, `bitmapDisplacement.ts`, `bitmapDissolve.ts`): `bevelBitmap`, `gradientBevelBitmap`, `gradientGlowBitmap`; `dropShadowBitmap`, `glowBitmap`, `innerGlowBitmap`, `innerShadowBitmap`; `pixelateBitmap`; `displaceBitmap`; `dissolveBitmapPixels`.

**Color manipulation** (`bitmapColorMatrix.ts`, `bitmapTransform.ts`, `bitmapPaletteMap.ts`, `bitmapTone.ts`): 4x5 color matrix apply/concat/identity plus 7 preset builders (brightness, contrast, grayscale, hue rotation, invert, saturation, sepia); `applyBitmapColorScaleBias`, `applyBitmapThreshold`, `mergeBitmap`; `applyBitmapPaletteMap`; `applyBitmapCurve` (per-channel LUT), `applyBitmapLevels`.

**Alpha/channel/format** (`bitmapAlpha.ts`, `bitmapChannel.ts`, `bitmapFormat.ts`, `bitmapImageChannel.ts`): `copyBitmapAlpha`, `multiplyBitmapAlpha`, `setBitmapAlpha`; `splitBitmapChannels`, `mergeBitmapChannels`; `convertBitmapPixelOrder` (RGBA/BGRA/ARGB/ABGR); `premultiplyBitmapPixels`, `unpremultiplyBitmapPixels`; `copyBitmapChannel` (flexible channel routing via `ImageChannel` enum).

**Fill/generate** (`bitmapFill.ts`, `bitmapNoise.ts`, `bitmapGradientFill.ts`, `bitmapGradient.ts`): `fillBitmapRectangle`, `floodFillBitmap`; `fillBitmapNoise` (deterministic pseudo-random), `fillBitmapPerlinNoise` (fractal value noise with stitch/channelOptions), `fillBitmapTurbulence` (abs-fBm variant), `BITMAP_NOISE_CHANNEL_{R,G,B,A}` constants; `fillBitmapLinearGradient`, `fillBitmapRadialGradient` (with focal point, spread modes); `buildBitmapGradientRamp`.

**Crop/extend** (`bitmapCrop.ts`): `cropBitmap`, `extendBitmap` (with all four `BitmapEdgeMode` values plus fill color), `trimBitmap` (tightest opaque bounding box).

**Analysis** (`bitmapCompare.ts`, `bitmapHistogram.ts`, `bitmapCoverage.ts`, `bitmapQuery.ts`, `bitmapFingerprint.ts`): `compareBitmap` (diff image), `getBitmapMismatch` (metric with tolerance); `getBitmapHistogram`, `equalizeBitmapHistogram`; `getBitmapCoverage`; `getBitmapColorBoundsRectangle`; `createBitmapFingerprint`, `compareBitmapFingerprints`, `formatBitmapFingerprint`, `parseBitmapFingerprint`, `BITMAP_FINGERPRINT_COMPUTATION_ID`.

**Encode/readback** (`bitmapEncode.ts`, `bitmapEncodeBackend.ts`, `bitmapReadbackBackend.ts`, `bitmapReadbackResolver.ts`, `explainBitmapReadback.ts`, `bitmapFrom.ts`, `bitmapDraw.ts`): `encodeBitmap` (PNG/JPEG via pluggable backend); `explainBitmapEncodeBackend`, `explainBitmapEncodeOperation`, `explainBitmapEncodeFailure`, `hasBitmapEncodeOperation`; readback with `createBitmapFromImageSource`, `createBitmapFromCanvas`, `captureBitmapFromImageResource`, `explainBitmapReadback`; `drawBitmap` (putImageData to canvas).

**Testing**: Every source file has a colocated `.test.ts` (44 test files for 45 source files -- `bitmapReadbackResolver.ts` shares with `bitmapReadbackBackend.test.ts`). Tests use `createBitmap` and constructors, not object literals. `describe` blocks are alphabetized.

## Gaps

These are capabilities a mature CPU pixel-manipulation library has that this one lacks.

1. **Module-level scratch buffers contradict the "no shared mutable state" North star.** Three sets of hidden module-level scratch arrays exist: `_scrollScratch` (`bitmapTransform.ts:5`), `_floodFillVisited` (`bitmapFill.ts:5`), `_windowRed`/`_windowGreen`/`_windowBlue`/`_windowAlpha` (`bitmapMedian.ts:78-81`). Status.md identifies these and notes that no caller-provided-scratch signature exists to mirror, making the shape a single design ruling. The `bitmapEncodeBackend.ts` and `bitmapReadbackBackend.ts` module-level state (`_custom`, `_host`) is a different category -- these are backend registries, an established pattern in the SDK, not scratch buffers.

2. **Duplicated internal helper functions.** Three nearly identical `resolveEdge` / `warpResolveEdge` / `resolveResizeEdge` / `resolveDisplacementEdge` functions appear in `bitmapAffine.ts:177`, `bitmapCrop.ts:162`, `bitmapDisplacement.ts:97`, `bitmapResize.ts:174`, and `bitmapWarp.ts:237`. All implement the same `BitmapEdgeMode` switch. Similarly, `catmullRomWeight` is duplicated verbatim in `bitmapAffine.ts:195`, `bitmapResize.ts:167`, and `bitmapWarp.ts:254`. These are private functions, so there is no export-lane violation, but factoring them into shared internal helpers would reduce maintenance burden.

3. **Morphological operations are radius-box only** (`bitmapMorphological.ts`). No structuring-element support, no distance transform (`computeBitmapDistanceTransform`), no signed distance field (`computeBitmapSignedDistanceField`). Status.md records this.

4. **Displacement map has a dual edge-mode vocabulary.** `displaceBitmap` (`bitmapDisplacement.ts`) accepts both an `edgeMode: BitmapEdgeMode` and a legacy `mode: 'wrap' | 'clamp' | 'ignore' | 'color'` with `fillColor`. When `edgeMode` is undefined, the legacy `mode` path runs (lines 53-69); when set, the unified `BitmapEdgeMode` path runs. The `'ignore'` and `'color'` legacy modes have no `BitmapEdgeMode` equivalent. This is a partially completed migration -- the unified sampling contract Decision says all geometric/sampling ops use `BitmapEdgeMode`, but `displaceBitmap` still carries the old vocabulary alongside it.

5. **No additional noise types beyond value noise.** The charter records that Simplex, Worley, and other noise types are architecturally supported but not built. The existing `fillBitmapPerlinNoise` uses value noise with smoothstep interpolation (not gradient-based Perlin noise), which may be worth clarifying in the function name or documentation.

6. **No wide-gamut or higher bit depth support.** `Bitmap` is `Uint8ClampedArray` (8-bit RGBA only). No `Float32Array` surface for HDR workflows. Status.md notes this is a user ruling before it is work.

7. **No `@flighthq/bitmap-formats` neighbor.** Format-specific encode/decode (TIFF, EXR, HDR, TGA, BMP, WebP) has no home. Status.md records this.

8. **Package description in `package.json` is stale.** `"Pixel-level image manipulation using browser ImageData"` understates a 114-export package and references `ImageData` (a DOM type the package does not import except through canvas readback). The charter Decision records updating the Package Map, but `package.json` still carries the old description.

## Charter contradictions

1. **North star 6 ("No shared mutable state") vs scratch buffers.** The three module-level scratch buffer sets (`_scrollScratch`, `_floodFillVisited`, `_windowRed`/`Green`/`Blue`/`Alpha`) are shared mutable state. A caller cannot opt out of the allocation retention and two concurrent calls to `scrollBitmap` or `floodFillBitmap` on the same data would share the buffer (though in single-threaded JS this is benign). This is the single place the package contradicts a stated North star principle. The status file records this as an open design ruling.

2. **Decision to unify `BitmapConvolutionEdge` into `BitmapEdgeMode` -- DONE.** The `BitmapConvolutionEdge` type no longer exists. `BitmapConvolutionOptions.edge` now takes `BitmapEdgeMode`. Convolution supports `'mirror'`. This Decision is fully landed.

3. **Decision on unified sampling contract -- MOSTLY DONE.** `resizeBitmap`, `rotateBitmap`, `transformBitmap`, `warpBitmap`, `warpBitmapQuad`, and `convolveBitmap` all accept `BitmapEdgeMode`. However, `displaceBitmap` still carries the legacy `mode` vocabulary alongside `edgeMode` (see Gaps item 4).

## Contract and docs fit

**(a) Package adherence to the codebase contract:**

- **Types in `@flighthq/types`**: All exported types (`Bitmap`, `BitmapRegion`, `BitmapEdgeMode`, `BitmapResizeMode`, `BitmapConvolutionOptions`, etc.) live in `@flighthq/types`. The package exports functions only. Correct.
- **Full unabbreviated names**: Every exported function includes the full `Bitmap` type name. No abbreviations. Correct.
- **Out-params and alias safety**: Functions document alias constraints explicitly (e.g., `convolveBitmap` "out must not alias source.bitmap.data"; `rotateBitmap180` "safe to pass the same bitmap"). `Readonly<>` is applied to input parameters. Correct.
- **Sentinels not throws**: `encodeBitmap` returns `null` on failure; `computeHomography`, `invertMatrix3x3` return `null` on degenerate input; `parseBitmapFingerprint` returns `null` for malformed input; `createBitmapFromImageSource` returns `null` on readback failure. `compareBitmap` and `getBitmapMismatch` throw on dimension mismatch, which is a precondition violation (programmer error) -- correct per the contract.
- **Two blessed export lanes**: `index.ts` (public, 114 named exports) and `contract.ts` (`export *` from all source files). No other subpaths. Correct.
- **`sideEffects: false`**: Declared in `package.json`. No module-top-level side effects (the scratch buffers are lazily allocated on first call, not on import). Correct.
- **Dependencies**: `entity`, `image`, `types` only. Minimal and correct. No `@flighthq/sdk` import.
- **Invalidation**: `invalidateBitmap` bumps `bitmap.version` with unsigned wrap. Called by every mutating function. Correct.
- **Diagnostics**: `explainBitmapReadback`, `explainBitmapEncodeBackend`, `explainBitmapEncodeOperation`, `explainBitmapEncodeFailure` follow the `explain*` pattern for silent sentinels. Correct.

**(b) Candidate contract/admin-doc revisions:**

- **Package Map line (AGENTS.md)**: Bitmap is listed under "Rendering" as `bitmap`. The charter notes the Package Map description ("pixel-level ImageSource manipulation; user-facing") understates the package. No specific Package Map prose was found in AGENTS.md beyond the name; the `package.json` `description` field is the stale one.
- **`package.json` description**: `"Pixel-level image manipulation using browser ImageData"` should be updated to match the charter scope.

## Candidate open directions

These are questions the charter does not answer that the review had to assume.

1. **Scratch-buffer design ruling.** The charter says "no shared mutable state" but three function families use module-level scratch. Should these become caller-provided scratch parameters (matching `boxBlurBitmap`'s `scratch` pattern), or should a package-level scratch pool exist? This design shapes the wasm-mixing boundary too: a C port needs explicit scratch ownership.

2. **Displacement map mode unification.** Should `displaceBitmap`'s legacy `mode` / `fillColor` parameters be removed in favor of pure `BitmapEdgeMode`? The `'ignore'` mode (keep undisplaced pixel) and `'color'` mode (fill with constant) have no `BitmapEdgeMode` equivalent. Either extend `BitmapEdgeMode` or accept the displacement-specific modes as domain-correct.

3. **Internal helper deduplication.** Five files carry nearly identical `resolveEdge` implementations and three carry identical `catmullRomWeight`. Should these be factored into a shared internal module (`bitmapSampling.ts`)? The duplication is harmless for tree-shaking (all private) but increases maintenance surface.

4. **Value noise vs gradient Perlin noise naming.** `fillBitmapPerlinNoise` uses value noise with smoothstep interpolation, not classical gradient-based Perlin noise. The distinction matters in procedural generation. Should the name be clarified, or is the OpenFL-compatibility naming intentional and sufficient?
