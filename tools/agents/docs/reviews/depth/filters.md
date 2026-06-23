# Depth Review: @flighthq/filters

**Domain:** Bitmap filter descriptors — the plain-data definition layer for the OpenFL/Flash family of bitmap filters (blur, glow, bevel, drop/inner shadow, color matrix, convolution, displacement map, gradient glow/bevel, plus the surface-effect set: median, pixelate, sharpen) — plus the one piece of cross-substrate math that every blur backend shares (sigma → box-blur radius).

**Verdict:** solid — **72/100**

This package is deliberately narrow. Per the codebase architecture, filter _application_ lives in sibling backend packages (`filters-canvas`, `filters-css`, `filters-gl`, `filters-wgpu`, `filters-surface`), and the type contracts live in `@flighthq/types`. So judged in isolation, the domain this package actually owns is "the descriptor constructors + shared blur math," and against _that_ domain it is close to complete. It would not stand alone as an authoritative "image filter library" in the rasterization sense — it rasterizes nothing — but that is missing-by-design, not by omission. The score reflects strong coverage of the descriptor catalog with a couple of genuine omissions (a `BitmapFilter` discriminator/kind helper, and clone/equality/serialization conveniences a mature descriptor library tends to ship).

## Present capabilities

Descriptor constructors (one `create*` per filter, each a thin spread over the `@flighthq/types` interface with the `kind` discriminant filled in):

- Blur family: `createBlurFilter` (blurX/blurY).
- Shadow/glow family: `createDropShadowFilter`, `createInnerShadowFilter`, `createInnerGlowFilter`, `createOuterGlowFilter`, `createGradientGlowFilter`, `createGradientBevelFilter`, `createBevelFilter` — with the canonical Flash parameter set surfaced via the type layer (angle, distance, color/alpha, strength, quality, knockout, hideObject, bevelType, highlight/shadow color+alpha, gradient colors/ratios/alphas).
- Color/convolution: `createColorMatrixFilter` (4×5 matrix), `createConvolutionFilter` (matrix + matrixX/matrixY, divisor, bias, preserveAlpha, clamp, color).
- Displacement: `createDisplacementMapFilter` with a real `DisplacementMapMode` union (`clamp | color | ignore | wrap`), component channels, scaleX/scaleY, color/alpha fill.
- Surface-effect descriptors that go beyond classic OpenFL: `createMedianFilter`, `createPixelateFilter`, `createSharpenFilter`.

Shared math (`blurMath.ts`) — the substantive code in the package:

- `computeBoxBlurRadius(sigma, passes)` — the uniform single-radius sigma→box-blur conversion for backends that apply one radius across every pass.
- `computeBoxBlurPassRadius(sigma, passes, pass)` — the per-pass two-box-width construction (lower width for the first m passes, next odd width up for the rest) that tracks a target Gaussian sigma without the overshoot of repeating a rounded radius. Non-decreasing in pass index, capped at two distinct widths.
- Both are well documented (variance derivation in comments) and well tested: the `blurMath.test.ts` suite asserts the effective-sigma error bounds, monotonicity, the two-width invariant, and explicitly contrasts the per-pass construction against the naive uniform overshoot. This is the one place in the package with real algorithmic depth and it is genuinely good.

Architecture/style: every export is plain data + free function, `sideEffects: false`, no runtime objects, types re-exported from `@flighthq/types`, one colocated test per source file. Consistent with the SDK's descriptor-over-runtime-object philosophy.

## Gaps vs an authoritative filter-descriptor library

Most of these are at the descriptor-ergonomics tier; the heavy raster gaps are owned by the `filters-*` backends and are out of scope here.

- **No `kind` discriminator/guard surface.** The package exports the constructors and re-exports the types but offers no `isBitmapFilter(x)` / `isBlurFilter(x)` predicates and no `BitmapFilterKind` registry/enum of the canonical kind strings. Consumers must hand-compare `filter.kind === 'BlurFilter'` against magic strings. For a package whose whole job is to be the descriptor authority, a typed kind catalog and per-kind narrowing guards are the expected convenience.
- **No clone/equality/normalization helpers.** A mature descriptor library typically ships `cloneFilter`, structural `equalsFilter`, and a `normalizeFilter` (apply defaults so downstream backends don't each re-default blurX/quality/etc.). Here every optional field stays `undefined` until a backend fills it, and defaulting logic is duplicated across the five backend packages rather than centralized once at the descriptor layer.
- **No color-matrix authoring helpers.** `createColorMatrixFilter` takes a raw 20-number array with no validation and no builders. An authoritative color-matrix offering provides the standard presets/combinators: identity, grayscale/desaturate, saturation, hue-rotate, brightness, contrast, sepia, invert, and matrix multiply/compose. These are canonical, backend-independent math and would fit this package precisely (they are pure number math, exactly like `blurMath`). Their absence is the biggest by-omission depth gap.
- **No convolution kernel presets.** Sharpen/emboss/edge-detect/box/Gaussian kernel builders are standard in convolution-filter libraries; here `createSharpenFilter` is only a descriptor with no exposed kernel, and `createConvolutionFilter` requires the caller to supply raw matrices.
- **Quality/pass mapping not exposed.** Flash's `quality` (1–3) maps to a blur pass count; `blurMath` consumes `passes` but the package exposes no `getBlurPassCountForQuality(quality)` bridge, so each backend re-derives that mapping.
- **No serialization round-trip note/test.** Kinds are strings (serializable by design) but there is no `fromFilterData`/validation entry point for untrusted scene JSON.

By design (correctly out of scope, do not add here): actual rasterization, CSS-string emission, GL/WGPU multipass recipes, bounds-expansion computation per filter (lives with the backends), and `BitmapData.applyFilter`-style imperative application.

## Naming / API-shape notes

- Constructor naming is consistent and self-identifying (`create<FilterType>Filter`), matching the SDK rule that function names carry the full type word. Good.
- `blurMath` names (`computeBoxBlurRadius` / `computeBoxBlurPassRadius`) are clear and the doc comments disambiguate the two-tier use well.
- The constructors are near-trivial spreads. That is acceptable for the descriptor pattern, but it also means the package's _value_ is almost entirely (a) the centralization point and (b) `blurMath`. The missing helpers above (kind guards, color-matrix presets, clone/equals/normalize, quality→passes) are exactly the things that would justify this being its own package rather than a folder of one-line factories. Adding them would move it from "solid" to "authoritative" for the descriptor domain without violating the backend split.
- `createColorMatrixFilter(matrix: ReadonlyArray<number>)` is the only constructor with a positional non-options arg and no length/range validation — inconsistent with the others and an easy footgun (a wrong-length array passes silently).

## Recommendation

Keep the package boundary as is — the descriptor/backend split is correct and tree-shakable. To reach AAA completeness for the descriptor domain it actually owns, add the backend-independent authoring math that currently has no home: color-matrix presets/combinators (identity, grayscale, saturation, hue, brightness, contrast, sepia, invert, multiply), convolution kernel builders (sharpen/emboss/edge/box/gaussian), a `BitmapFilterKind` catalog with `is*Filter` guards, and `clone/equals/normalize` + a `quality→passes` bridge so backends stop duplicating defaulting. Also validate the color-matrix length. None of these pull in a backend or break `sideEffects: false`. The blur math is already authoritative-grade; the rest of the package is currently a thin-but-correct factory layer that has room to become a real descriptor library.
