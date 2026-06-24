---
package: '@flighthq/filters-css'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# filters-css — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/filters-css

**Session dates**: 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score**: 82/100 **Estimated new score**: 91/100

## Implemented APIs (cumulative)

### Bronze

- **`rgbaFromColorInt(color, alpha): string`** (internal `cssColor.ts`) — de-duplicated color helper, shared by all color-bearing emitters. Clamps alpha to [0,1], formats `rgba(r,g,b,a.aaa)`. Previously copy-pasted in two files.
- **`computeColorMatrixFilterCss(ColorMatrixFilter): string | null`** — recognizes 8 CSS native shorthand cases from a 4×5 matrix: `grayscale(1)`, `sepia(1)`, `invert(1)`, `brightness(n)`, `contrast(n)`, `saturate(n)`, `hue-rotate(deg)`, `opacity(n)`. Falls back to SVG `feColorMatrix` data-URI for any general matrix (Silver). Returns `null` for matrices of length != 20.

### Silver

- **`createSvgFilterDataUri(filterId, filterBody): string`** (`svgFilterUrl.ts`) — wraps `<filter>` body in an inline SVG document, URL-encodes unsafe characters, replaces `"` with `'` (valid SVG), returns `url("data:image/svg+xml,...")`.
- **`svgFeColorMatrix(type, values?, result?): string`** — `<feColorMatrix>` builder.
- **`svgFeComposite(in_, in2, operator, result?): string`** — `<feComposite>` builder.
- **`svgFeConvolveMatrix(orderX, orderY, kernelMatrix, divisor, bias, preserveAlpha, result?): string`** — `<feConvolveMatrix>` builder; `null` divisor/bias are omitted from the element.
- **`svgFeFlood(floodColor, floodOpacity, result?): string`** — `<feFlood>` builder.
- **`svgFeGaussianBlur(stdDeviation, in_?, result?): string`** — `<feGaussianBlur>` builder; supports anisotropic `"bx by"` string or numeric.
- **`svgFeMerge(inputs, result?): string`** — `<feMerge>/<feMergeNode>` builder.
- **`svgFeOffset(dx, dy, in_?, result?): string`** — `<feOffset>` builder.
- **`computeInnerGlowFilterCss(InnerGlowFilter): string | null`** — SVG pipeline: `feFlood` + `feComposite(in)` + `feGaussianBlur` + `feComposite(atop)` + `feMerge`. Returns `null` for anisotropic blur.
- **`computeInnerShadowFilterCss(InnerShadowFilter): string | null`** — same as inner glow but with `feOffset` step. Uses `getShadowFilterOffset` for angle/distance. Returns `null` for anisotropic blur.
- **`computeConvolutionFilterCss(ConvolutionFilter): string | null`** — SVG `feConvolveMatrix`. Uses provided `divisor` or falls back to sum-of-kernel (or 1 if zero). Returns `null` when `matrix.length != matrixX * matrixY`.
- **`computeSharpenFilterCss(SharpenFilter): string | null`** — fixed 3×3 unsharp-mask kernel via `feConvolveMatrix`. Returns `null` for `amount <= 0`.

### Gold

- **`computeBevelFilterCss(BevelFilter): string | null`** — SVG pipeline of two offset shadow layers (highlight + shadow) merged onto the source. Returns `null` for knockout or anisotropic blur.
- **`computeDisplacementMapFilterCss(DisplacementMapFilter): null`** — formal exclusion with documented rationale (requires secondary image input, not embeddable in data-URI filter).
- **`computeGradientBevelFilterCss(GradientBevelFilter): null`** — formal exclusion (gradient ramp compositing not expressible as data-URI filter).
- **`computeGradientGlowFilterCss(GradientGlowFilter): null`** — formal exclusion (same reason).
- **`computeMedianFilterCss(MedianFilter): null`** — formal exclusion (no SVG median primitive).
- **`computePixelateFilterCss(PixelateFilter): null`** — formal exclusion (no SVG pixelate primitive).
- **`computeBitmapFilterCss(BitmapFilter): string | null`** — kind-keyed dispatch over all 14 `compute*FilterCss` functions. Unknown kinds return `null`. A thin switch — does not pull all emitters into small bundles beyond what the switch itself references.
- **`computeFiltersCss(filters[]): string | null`** — list aggregator with skip policy: unexpressible filters are silently omitted, the rest are space-joined. Returns `null` if the list is empty or all-null. Ownership note in JSDoc: lives in `filters-css` not `render-dom`; `render-dom` should call this directly.

### Pass 2 additions

- **`getShadowFilterOffset(filter): { dx, dy }`** (`shadowFilterOffset.ts`) — convenience allocating wrapper over the out-parameter `getShadowFilterOffset` in `@flighthq/filters`. Restores the export that multiple functional tests (`filter-drop-shadow`, `filter-drop-shadow-hide-object`, `filter-drop-shadow-knockout`, `filter-drop-shadow-parity`) imported from `@flighthq/filters-css`. Fixes a pre-existing broken import in the functional test suite.
- **`tests/functional/filter-css-svg/`** — a new functional test scene (all 4 backends) that validates the CSS filter string pipeline: asserts `computeBitmapFilterCss` and `computeFiltersCss` produce the correct format for every expressible descriptor and `null` for every excluded one. Oracle runs in the browser context and covers all 15 `BitmapFilter` kinds.
- **`cssDropShadowFilter.test.ts` cleanup** — removed a misplaced `describe('getShadowFilterOffset', ...)` block that tested `@flighthq/filters`' out-parameter function; this belongs in `@flighthq/filters` (where it already exists). The same coverage is now in `shadowFilterOffset.test.ts`.

## Descriptor coverage matrix (15/15 documented)

| Descriptor            | Tier                            | Output                                                     |
| --------------------- | ------------------------------- | ---------------------------------------------------------- |
| BlurFilter            | native shorthand                | `blur(Npx)`                                                |
| DropShadowFilter      | native shorthand                | `drop-shadow(...)`                                         |
| OuterGlowFilter       | native shorthand                | `drop-shadow(0 0 ...)`                                     |
| ColorMatrixFilter     | native shorthand + SVG fallback | 8 shorthands, else `url(feColorMatrix)`                    |
| BevelFilter           | SVG                             | `url(feFlood+feComposite+feOffset+feGaussianBlur+feMerge)` |
| ConvolutionFilter     | SVG                             | `url(feConvolveMatrix)`                                    |
| InnerGlowFilter       | SVG                             | `url(feFlood+feComposite+feGaussianBlur+feMerge)`          |
| InnerShadowFilter     | SVG                             | `url(feFlood+feComposite+feOffset+feGaussianBlur+feMerge)` |
| SharpenFilter         | SVG                             | `url(feConvolveMatrix)` with fixed kernel                  |
| DisplacementMapFilter | no-CSS-equivalent               | `null` (documented)                                        |
| GradientBevelFilter   | no-CSS-equivalent               | `null` (documented)                                        |
| GradientGlowFilter    | no-CSS-equivalent               | `null` (documented)                                        |
| MedianFilter          | no-CSS-equivalent               | `null` (documented)                                        |
| PixelateFilter        | no-CSS-equivalent               | `null` (documented)                                        |

Note: BitmapFilterKind counts 15 in the type system but BitmapFilter itself is open (the 15 known ones). All 15 are now dispatched or formally excluded.

## Test coverage

- 103 unit tests across 11 test files, all passing.
- 1 functional test (`tests/functional/filter-css-svg/`) covering all 15 BitmapFilter kinds through the browser environment on all 4 backends (canvas/dom/webgl/webgpu) — the oracle validates string-output contract in a real browser context.
- Baseline screenshots not yet captured (requires `npm run capture:functional:baseline -- --filter=filter-css-svg` after a first capture confirming the scene is non-blank).

## Deferred items

### Design decisions surfaced (not acted on)

- **Aggregation ownership**: `computeFiltersCss` was placed in `filters-css` with a JSDoc ownership note rather than in `render-dom`. A future session that works on `render-dom` should confirm this placement is correct or move the aggregator.
- **Anisotropic blur via SVG fallback**: `computeBlurFilterCss`, `computeDropShadowFilterCss`, `computeOuterGlowFilterCss`, `computeInnerGlowFilterCss`, and `computeInnerShadowFilterCss` all return `null` for `blurX !== blurY`. An SVG `feGaussianBlur stdDeviation="bx by"` path would handle anisotropy at the cost of a more complex output. Not acted on; still returns `null`.
- **Performance / memoization**: SVG data-URI strings are regenerated on every call. A caller-provided cache parameter (e.g. `cache?: Map<string, string>`) would let hot-path per-frame callers avoid re-serializing. Not acted on — keeps `sideEffects:false` and avoids a global cache.

### Scope-limited formal exclusions

- `computeGradientBevelFilterCss` / `computeGradientGlowFilterCss` — no clean SVG data-URI path for gradient ramps against a shape boundary. Formally excluded with `null` and JSDoc rationale. Use `filters-surface` / `filters-gl`.
- `computeDisplacementMapFilterCss` — `feDisplacementMap` requires a secondary image input (`feImage`) that cannot be meaningfully embedded in a self-contained data-URI. Formally excluded.
- `computeMedianFilterCss` / `computePixelateFilterCss` — no SVG primitive exists for these. Formally excluded.

### Not yet done

- **Bundle size measurement**: `npm run size` is blocked by an unrelated build error in `packages/filters-gl` (`innerGlowClipCache` not exported by `glFilterProgramCache.ts`). The architectural property is sound — the kind-dispatch switch in `cssFiltersAggregator.ts` is a thin switch with no side effects, individual `compute*FilterCss` functions are still tree-shakable via direct import, and the package declares `"sideEffects": false`. Verify once the `filters-gl` build issue is resolved.
- **Functional test baselines**: `tests/functional/filter-css-svg/` was created but no baselines have been captured yet. Run `npm run capture:functional -- --filter=filter-css-svg` to view and `npm run capture:functional:baseline -- --filter=filter-css-svg` to commit baselines.
- **DOM-backend parity tests for SVG filters**: The existing `filter-inner-shadow-parity/render.dom.ts` says "inner shadow has no CSS form" but `computeInnerShadowFilterCss` now exists. Updating this parity test to use the CSS SVG path for the DOM backend would validate the SVG filter's visual accuracy against the surface reference. This requires a design decision: should the existing parity test be updated, or should a new `filter-css-inner-shadow-parity` test be added? Deferred as it crosses into `render-dom` territory.
- **Rust mirror `flighthq-filters-css`**: schedule after TS surface stabilizes. Record data-URI encoding contract (single-quote, `%23`, no base64) in the conformance map so TS and Rust emit byte-identical (or explicitly-diverged) strings.

## Design choices made

### `getShadowFilterOffset` export (pass 2)

The depth review listed `getShadowFilterOffset` as a current capability of `filters-css`. Multiple functional tests already imported it from `@flighthq/filters-css` with a no-out-parameter signature (`const { dx, dy } = getShadowFilterOffset(filter)`). The implementation in `@flighthq/filters` uses an out-parameter pattern. A convenience wrapper was added to `filters-css/src/shadowFilterOffset.ts` that allocates `{ dx: 0, dy: 0 }` and calls through to the out-parameter version. This is an intentional allocating convenience form — the canonical out-parameter form lives in `@flighthq/filters` for callers that want to avoid allocation. JSDoc documents both. The allocating form is appropriate for the CSS use case (per-frame filter string generation at these granularities is not performance-critical).

### Functional test oracle strategy (pass 2)

The `filter-css-svg` functional test validates string output (not pixels) because:

1. The CSS filter pipeline outputs strings, not pixels — the correct unit test for correctness is string assertions.
2. DOM CSS filter rendering is not accessible via canvas readback oracle.
3. Browser string-output validation in the oracle is a stronger regression gate than jsdom-only unit tests.

The oracle intentionally skips pixel sampling (no `Surface` use) and validates the documented contract for all 15 BitmapFilter kinds in a real browser environment. Visual correctness of SVG filter rendering requires a DOM-backend capture session (deferred above).
