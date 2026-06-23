# Depth Review: @flighthq/filters-css

**Domain**: CSS `filter`-string generation — translating Flight's plain-data bitmap filter descriptors into native CSS `filter` property values for the DOM renderer.

**Verdict**: partial — 35/100

This package is not a stub: each of its three functions is correct, well-documented, and honest about CSS's expressive limits (returning `null` for anisotropic blur, knockout, etc.). But measured against the filter descriptor set the rest of the SDK supports, and against the native CSS `filter` function vocabulary, it implements only the small "shadow/blur" corner and leaves the entire color-adjustment half of CSS filters untouched. As the CSS backend of a filter family whose GL and surface backends cover all 14–15 descriptors, this is the thinnest member by a wide margin.

## Present capabilities

- `computeBlurFilterCss(BlurFilter): string | null` — maps to `blur(Npx)`. Correctly returns `null` for anisotropic (`blurX !== blurY`) and non-positive blur, since CSS `blur()` is isotropic. Defaults `4`.
- `computeDropShadowFilterCss(DropShadowFilter): string | null` — maps to `drop-shadow(dx dy blur color)`. Returns `null` for `knockout` and anisotropic blur. Packs `0xRRGGBB` + alpha into `rgba(...)`.
- `computeOuterGlowFilterCss(OuterGlowFilter): string | null` — modeled as a centered (`0 0 blur`) `drop-shadow()`. Same null cases.
- `getShadowFilterOffset(DropShadowFilter | InnerShadowFilter | BevelFilter): { dx, dy }` — shared angle/distance→pixel-offset helper (degrees, 0 = right, clockwise, rounded).

The code is clean, side-effect-free, value-in/string-out, and the JSDoc on every export explains precisely why a CSS equivalent does or does not exist. That part is exemplary.

## Gaps vs an authoritative CSS-filter library

The Flight `@flighthq/types` filter set has 15 descriptors (Bevel, Blur, ColorMatrix, Convolution, DisplacementMap, DropShadow, GradientBevel, GradientGlow, InnerGlow, InnerShadow, Median, OuterGlow, Pixelate, Sharpen). The GL and surface backends each implement ~14–15. This CSS backend implements 3. The native CSS `filter` function vocabulary is also only partly used.

Missing-by-omission (a CSS equivalent exists and is canonical):

- **ColorMatrixFilter** — the single biggest gap. The native CSS `filter` shorthand functions `brightness()`, `contrast()`, `saturate()`, `grayscale()`, `sepia()`, `hue-rotate()`, `invert()`, and `opacity()` are all special-cases of a color matrix, and a general matrix is expressible via `url(#id)` referencing an inline SVG `feColorMatrix`. An authoritative CSS filter backend would expose `computeColorMatrixFilterCss` (recognizing the common shorthand cases, falling back to an SVG `url()` data-URI for the general 4x5 matrix). Today none of `brightness/contrast/saturate/grayscale/sepia/hue-rotate/invert/opacity` is reachable through this package at all.
- **InnerShadowFilter / InnerGlowFilter** — CSS `drop-shadow()` is outer-only, but inner shadow/glow are routinely done in CSS via `url()` to an SVG filter (`feFlood` + `feComposite` + blur), and the package already imports `InnerShadowFilter` into the shared `getShadowFilterOffset` signature, signalling intent. Neither has a `compute*Css`.
- **The native shorthand functions as first-class entries** — even independent of ColorMatrix, a mature CSS-filter library is expected to surface `blur`, `brightness`, `contrast`, `drop-shadow`, `grayscale`, `hue-rotate`, `invert`, `opacity`, `saturate`, `sepia`. This package surfaces 2 of the 10.

Missing-but-arguably-by-design (CSS has no clean equivalent; `null`/SVG-`url()` only):

- **BevelFilter / GradientBevelFilter / GradientGlowFilter** — no direct CSS function; would require SVG-`url()` composition. Reasonable to defer, but should be stated.
- **ConvolutionFilter / SharpenFilter / MedianFilter / DisplacementMapFilter / PixelateFilter** — expressible only via SVG `feConvolveMatrix` / `feDisplacementMap` / no equivalent. Defer-with-rationale is defensible, but an authoritative library would at least document the SVG `url()` escape hatch and ideally provide `computeConvolutionFilterCss` over `feConvolveMatrix`.

The deeper structural gap: this package has no `url()`/SVG-filter path at all. The CSS `filter` property's full power (and the only way to reach inner-shadow, general color matrices, convolution, displacement) is `url(#svg-filter)`. Without it, the package is permanently capped at the handful of shorthand functions — which it then only half-implements.

## Naming / API-shape notes

- `compute*FilterCss` is a good, self-identifying name pattern and is consistent across the three functions. It reads as "pure value→string", which matches behavior. Keep this shape for any additions (`computeColorMatrixFilterCss`, etc.).
- The `null` sentinel for "no CSS equivalent" is the right convention per the project's return-sentinel rule, and is documented per-function. Good.
- `getShadowFilterOffset` is correctly a shared geometry helper and correctly accepts the union `DropShadowFilter | InnerShadowFilter | BevelFilter` — but two of those three union members (InnerShadow, Bevel) have no consuming `compute*Css` function, so the helper currently advertises support the package does not deliver. Either add those backends or the union is aspirational.
- Sibling backends (`filters-gl`, `filters-surface`, `filters-canvas`) use `apply*To<Backend>` verbs because they mutate a target; `compute*Css` correctly differs because CSS output is a returned string, not an applied effect. The asymmetry is justified, not a naming defect.
- `rgbaFromInt` is duplicated verbatim in `cssDropShadowFilter.ts` and `cssOuterGlowFilter.ts`. Minor, but as more color-bearing filters are added it should become one shared internal helper (or live in a color util) rather than being copy-pasted per file.

## Recommendation

Treat this as a partial backend to be brought toward parity with its GL/surface siblings, scoped to what CSS can actually express:

1. **Add `computeColorMatrixFilterCss`** — the highest-value addition. Recognize the canonical shorthand cases (`brightness/contrast/saturate/grayscale/sepia/hue-rotate/invert/opacity`) and fall back to an SVG `url()` data-URI `feColorMatrix` for the general matrix. This alone unlocks ~8 native CSS filter functions.
2. **Introduce an SVG-`url()` path** so inner-shadow, inner-glow, and convolution become reachable; without it the package is structurally capped. Add `computeInnerShadowFilterCss` / `computeInnerGlowFilterCss` over an inline SVG filter, which also retires the now-unfulfilled `InnerShadowFilter`/`BevelFilter` arms of `getShadowFilterOffset`'s union.
3. **Document the deliberate exclusions** (Bevel, Gradient\*, Displacement, Median, Pixelate, Sharpen) — for each, state whether it is "no CSS equivalent → use surface/GL backend" or "deferred SVG-`url()` work". This converts silent omission into a recorded design boundary.
4. **De-duplicate `rgbaFromInt`** into one internal helper.

Until at least the ColorMatrix + native-shorthand coverage lands, this package answers "no" to the authoritative-library bar: it is a correct-but-narrow shadow/blur translator, not a full CSS-filter library.
