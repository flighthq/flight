# Maturation Roadmap: @flighthq/filters-css

**Current verdict**: partial — 35/100. A correct-but-narrow shadow/blur translator (3 of 15 descriptors, 2 of 10 native CSS shorthand functions, no SVG `url()` path), not yet a full CSS-filter library.

The package's domain is value-in / string-out: turn a plain-data `BitmapFilter` descriptor into a CSS `filter` property value for the DOM renderer. There is no platform capability seam here (no `*Backend`), no allocation, no signals — so most of the cross-cutting Flight rules collapse to: full unabbreviated names, `compute*FilterCss(filter): string | null`, `null` for "no CSS equivalent", single root `.` export, `"sideEffects": false`, types already living in `@flighthq/types`. The maturation work is almost entirely _coverage of the descriptor set_ plus one structural addition (the SVG `url()` path) that unlocks the second half of that set.

## Bronze

The minimum genuinely-useful CSS backend: cover every filter CSS expresses with a _native shorthand function_, and unify the internal color helper. No SVG yet — this is the pure-shorthand tier.

- `computeColorMatrixFilterCss(ColorMatrixFilter): string | null` — the single highest-value addition. Recognize the canonical shorthand special-cases of a 4×5 color matrix and emit the matching native function: `grayscale(1)`, `sepia(1)`, `invert(1)`, `saturate(n)`, `brightness(n)`, `contrast(n)`, `hue-rotate(deg)`, `opacity(n)`. Return `null` (defer to Silver/SVG) for any matrix that is not one of these recognized forms. This alone makes ~8 native CSS filter functions reachable through the package.
- Internal matrix-recognition helpers behind `computeColorMatrixFilterCss` (not exported): `isGrayscaleMatrix`, `isSepiaMatrix`, `getSaturateAmount`, `getHueRotateDegrees`, etc. — small predicate/extractor functions that classify a `ReadonlyArray<number>` matrix against the known shorthand identities (within an epsilon tolerance).
- De-duplicate `rgbaFromInt` — extract the verbatim copy in `cssDropShadowFilter.ts` and `cssOuterGlowFilter.ts` into one internal module (`cssColor.ts`, `rgbaFromColorInt(color, alpha)`), used by all color-bearing emitters. New color filters reuse it instead of re-pasting.
- `computeInnerGlowFilterCss` / `computeInnerShadowFilterCss` returning `null` with a documented rationale **for now** (no shorthand exists; promoted to real output in Silver via SVG). This makes the `getShadowFilterOffset` union honest at the doc level immediately, before the SVG work lands.
- Tests for every new export, colocated `*.test.ts`, `describe` blocks alphabetized to mirror exports. Cover: each shorthand recognition case, the unrecognized-matrix `null` fallback, and the de-duplicated color helper.

Effort: small–medium. No new types, no `@flighthq/types` changes (`ColorMatrixFilter` already exists), no SVG. This is the 20% that delivers most of the value.

## Silver

Competitive and solid: introduce the **SVG `url()` data-URI path**, the structural piece that lifts the package off its shorthand ceiling, and use it to deliver the general color matrix plus inner shadow/glow. After Silver, every filter CSS _can_ express is expressed.

- **SVG filter emission infrastructure** (internal module, e.g. `svgFilterUrl.ts`):
  - `createSvgFilterDataUri(filterId, svgFilterBody): string` — wraps an `<filter>` element body in a minimal inline `<svg>` and returns a `url("data:image/svg+xml,...")` value suitable for the CSS `filter` property. Owns escaping/encoding of the data-URI.
  - A small set of `feColorMatrix` / `feGaussianBlur` / `feFlood` / `feComposite` / `feOffset` / `feMerge` string builders as internal helpers — the SVG primitive vocabulary the `compute*` functions compose.
- `computeColorMatrixFilterCss` — extend so the _general_ (non-shorthand) 4×5 matrix falls back to `url()` referencing an inline `feColorMatrix type="matrix"`, instead of returning `null`. Shorthand cases still emit the cheaper native function.
- `computeInnerShadowFilterCss(InnerShadowFilter): string | null` — real output via SVG (`feFlood` + `feComposite operator="out"`/`"in"` + `feGaussianBlur` + `feOffset` using `getShadowFilterOffset`). Retires the aspirational `InnerShadowFilter` arm of `getShadowFilterOffset`'s union.
- `computeInnerGlowFilterCss(InnerGlowFilter): string | null` — real output via SVG (centered inner composite, no offset). Same union-honesty win.
- `computeConvolutionFilterCss(ConvolutionFilter): string | null` — over `feConvolveMatrix` (divisor, bias, preserveAlpha mapping). The first non-shadow SVG filter; also a stepping stone to Sharpen.
- `computeSharpenFilterCss(SharpenFilter): string | null` — emit as a fixed sharpen convolution kernel via the same `feConvolveMatrix` path.
- Anisotropic-blur via SVG fallback: where `blurX !== blurY` currently forces `null` for blur/drop-shadow/outer-glow, optionally emit an SVG `feGaussianBlur stdDeviation="bx by"` path (the native `blur()`/`drop-shadow()` shorthand stays the fast path for the isotropic case). Decide explicitly whether anisotropy is worth the SVG cost here (see Sequencing).
- A **documented exclusion table** in the package (and in this review's recorded boundary): for each of the 15 descriptors, state `native-shorthand` / `svg-url` / `no-CSS-equivalent → use surface|gl backend`. Converts every silent omission into a recorded design decision.
- Cross-backend consistency check: confirm the SVG `feColorMatrix` / `feConvolveMatrix` output is _visually consistent_ with `filters-surface` and `filters-gl` for the same descriptor (offset rounding, premultiplied-alpha handling, color convention `0xRRGGBB` + alpha). This is where the DOM backend earns "agrees with its siblings."

Effort: medium–large. The SVG infrastructure is the bulk of it; once it exists, each new `compute*Css` is incremental. No `@flighthq/types` changes (all consumed types exist). One real design decision (anisotropy via SVG) to surface.

## Gold

Authoritative / AAA: exhaustive coverage of everything CSS+SVG can express, correctness at the edges, an aggregation entry point, functional-test visual coverage, and the Rust-port mirror.

- **Gradient and bevel family via SVG** — the remaining descriptors that have _some_ SVG path:
  - `computeBevelFilterCss(BevelFilter): string | null` — SVG composition of two offset shadows (highlight + shadow color) over the source; retires the last (`BevelFilter`) arm of `getShadowFilterOffset`'s union.
  - `computeGradientBevelFilterCss(GradientBevelFilter): string | null` and `computeGradientGlowFilterCss(GradientGlowFilter): string | null` — SVG `feComponentTransfer` / gradient-ramp composition. These are the hardest CSS-expressible filters; deliver or formally exclude with a tested rationale.
  - `computeDisplacementMapFilterCss(DisplacementMapFilter): string | null` — over `feDisplacementMap` (requires emitting the displacement image as a secondary input / `feImage`).
- **Formal exclusions, tested**: `computeMedianFilterCss` and `computePixelateFilterCss` — `null` with a colocated test asserting the `null` and a doc line ("no CSS/SVG equivalent → use `filters-surface`/`filters-gl`"). Pixelate has no SVG primitive; Median has none. Recording them as deliberate `null`s completes the 15/15 descriptor matrix.
- **Aggregation entry point**: `computeFiltersCss(filters: ReadonlyArray<BitmapFilter>): string | null` — compose an ordered list of descriptors into a single space-separated CSS `filter` value, dropping (or `null`-ing) members with no CSS equivalent per a documented policy. This is the function the DOM renderer actually wants; the per-filter functions become its building blocks. Decide the policy: skip-unexpressible vs. fail-whole-list.
- **Dispatch helper**: `computeBitmapFilterCss(filter: BitmapFilter): string | null` — a `kind`-keyed dispatch over all `compute*FilterCss` functions, so callers route by descriptor `kind` string without a hand-written switch. Keep it tree-shakable (a thin switch, not a registry that pulls every emitter into small bundles — measure with `npm run size`).
- **Edge-case and error hardening**: NaN/Infinity guards on numeric inputs, clamping of out-of-range alpha/percentage, deterministic rounding identical to siblings, data-URI escaping correctness for arbitrary colors and matrices, and `null` (not a malformed string) for every unrepresentable case. Misuse-only throws per the sentinel rule.
- **Functional-test visual coverage**: a `tests/functional/filter-*` scene (or extension of existing filter scenes) that renders representative descriptors through the DOM backend and compares against the raster backends for parity, via the `functional-test` skill. This is the only way to validate the SVG output actually renders correctly cross-browser — jsdom cannot.
- **Performance**: cache/memoize generated SVG data-URIs for repeated identical descriptors (the same filter applied per-frame should not re-serialize an SVG string each frame); prefer the native shorthand fast path wherever both are valid.
- **Rust-port mirror** `flighthq-filters-css`: 1:1 conformance — `compute_color_matrix_filter_css`, `compute_inner_shadow_filter_css`, the SVG-url builder, etc., snake_cased, value-in/`Option<String>`-out. Per the Rust map this is a value-typed leaf (plain data → string), so it is in the **mixable** set and a strong early conformance target. Record the TS↔Rust mapping in the conformance map; pair any divergence (e.g. data-URI encoding differences) explicitly.

Effort: large, but highly parallelizable per-filter once the Silver SVG infrastructure exists. The genuine frontier is GradientBevel/GradientGlow/DisplacementMap (SVG composition is fiddly and may be partially deferred-with-rationale) and the functional-test parity gate.

## Sequencing & effort

Recommended order, with dependencies:

1. **Bronze first, in one pass** — `computeColorMatrixFilterCss` (shorthand-only) + `rgbaFromColorInt` de-dup + inner-shadow/glow stubbed `null` + tests. No dependencies; no `@flighthq/types` work needed (`ColorMatrixFilter` and all other descriptors already exist as types). This is the cheapest, highest-leverage step and should land alone.
2. **Silver pivots on the SVG `url()` infrastructure** — build `createSvgFilterDataUri` + the `fe*` builders _before_ any SVG-backed `compute*` function. Everything in Silver and most of Gold depends on it; it is the structural unlock the depth review flags as the package's hard ceiling. Order within Silver: general color-matrix fallback → inner shadow/glow → convolution → sharpen.
3. **Gold last, per-filter** — bevel/gradient/displacement and the aggregators are independent of each other once SVG exists, so they parallelize. Save GradientBevel/GradientGlow/DisplacementMap for the end; be prepared to formally exclude them with a tested rationale rather than ship a wrong approximation.

Cross-package / design-decision items to surface before acting:

- **Aggregation ownership (decide with the DOM renderer team)**: should `computeFiltersCss(filters[])` live here, or does `@flighthq/render-dom` own list composition and call the per-filter functions? The depth review treats this package as pure per-filter translation; adding the aggregator changes the seam. Surface this rather than deciding unilaterally — it touches the `render-dom` ↔ `filters-css` boundary.
- **Anisotropy policy**: whether to break the current isotropic-only `null` for blur/drop-shadow/outer-glow by adding an SVG `feGaussianBlur` fallback (Silver). It trades the cheap native shorthand for an SVG round-trip; confirm the DOM renderer wants anisotropic blur badly enough to pay it.
- **Exclusion policy as a recorded boundary**: the 15-descriptor matrix (native / svg / no-equivalent) should be written into the package docs and this maturation doc so Median/Pixelate (and any deferred Gradient\*/Displacement) read as deliberate, not missing.
- **Bundle size**: the `kind`-dispatch helper (`computeBitmapFilterCss`) and the aggregator risk pulling every emitter into a small DOM bundle. Run `npm run size` after adding them; keep the dispatch a thin switch so individual `compute*` imports still tree-shake.
- **Rust mirror as conformance instrument**: `flighthq-filters-css` is value-in/string-out and headlessly fingerprint-able, making it an ideal early mixing/conformance target — schedule it after the TS surface stabilizes (post-Silver), and record the data-URI encoding contract in the conformance map so TS and Rust emit byte-identical (or explicitly-diverged) strings.

No `@flighthq/types` additions are required at any tier: every descriptor this package can ever consume (`ColorMatrixFilter`, `ConvolutionFilter`, `SharpenFilter`, `InnerShadowFilter`, `InnerGlowFilter`, `BevelFilter`, `GradientBevelFilter`, `GradientGlowFilter`, `DisplacementMapFilter`, `MedianFilter`, `PixelateFilter`) already exists in the header layer. The work is entirely emitter coverage plus the SVG infrastructure inside this package.
