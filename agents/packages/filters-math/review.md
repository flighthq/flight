---
package: '@flighthq/filters-math'
status: solid
score: 55
updated: 2026-07-09
ingested:
  - source
  - tests
---

# filters-math — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/filters-math.md)._

**Domain:** Backend-shared filter mathematics — the numeric conversions every filter backend (canvas/css/gl/wgpu/surface) needs to agree on so the same descriptor renders the same everywhere: blur radius/sigma mappings, kernel derivations, offset geometry.

**Verdict:** partial — completeness 30/100

The package exports four functions in two files: three box-blur/Gaussian conversions (`computeBoxBlurRadius`, `computeBoxBlurPassRadius`, `computeGaussianSigmaForBlurRadius`) and `getShadowFilterOffset`. It is not a grab-bag — both files are genuinely cross-backend math extracted so five backends and the `filters` intents package stop re-deriving it, and the blur math in particular is sophisticated (the two-adjacent-odd-widths variance-tracking scheme is the correct Kovesi-style answer, with tests that assert non-overshoot against the naive repeated-radius approach). The problem is that the extraction stopped after the first two primitives. Substantial backend-shared filter math still lives *above* this package in `filters` (`colorMatrixMath.ts`, `convolutionKernels.ts`, `blurQuality.ts`, `bitmapFilterMargin.ts`), and the math every GPU backend needs most — Gaussian kernel weight generation — does not exist in either place. As a coherent primitive it is well-cut; as a library it is a fifth built.

## Present capabilities

- `computeBoxBlurRadius(sigma, passes)` — single uniform box radius whose `passes`-fold variance matches a Gaussian sigma; the standard W3C/SVG-derived formula, `0` sentinel for non-positive sigma.
- `computeBoxBlurPassRadius(sigma, passes, pass)` — per-pass radius using two adjacent odd box widths so combined variance tracks sigma without cumulative overshoot; non-decreasing in `pass`; for backends that can vary radius per pass (gl separable passes). Docs explain exactly when to use which — model documentation.
- `computeGaussianSigmaForBlurRadius(radius, passes)` — the inverse mapping (e.g. Flash `blurX` → sigma-based backend).
- `getShadowFilterOffset(filter, out)` — degrees-clockwise angle + distance → rounded `{dx, dy}`, Flash/OpenFL convention, shared by drop-shadow/inner-shadow/bevel across every backend; out-param returning `out`, filter types from `@flighthq/types`.
- Tests: 19 cases including variance-approximation bounds, monotonicity, the overshoot comparison, sentinels, and per-filter-kind coverage of the offset.

## Gaps vs an authoritative filter-math library

Compare the shared math layers inside Skia, Cairo, WebRender, and the SVG filter spec's reference formulas — the conversions any two filter backends must share to agree pixel-for-pixel:

- **Gaussian kernel weight generation** — the conspicuous absence: no `computeGaussianKernelWeights(sigma, out)` (1D normalized weights), no kernel-size-from-sigma rule (the ceil(3σ)·2+1 support cutoff), no truncated/renormalized tail handling. Every GPU backend shipping a true-Gaussian path needs exactly this, and today it would be written in-backend — the very duplication this package exists to prevent.
- **Linear-sampling weight/offset optimization** — the standard GPU trick (pairing taps via bilinear sampling: N taps → N/2+1 weights+offsets). This is *the* canonical shared-blur-math export for gl/wgpu backends; its absence means any optimized shader derives it locally.
- **Blur margin/padding math** — the pixel expansion a blur of given sigma/quality requires lives in `filters/bitmapFilterMargin.ts`, above the seam. Margin is pure math coupled to the same box-blur model as this package; backends and the intents package both need it, which is precisely this package's charter (see layering note below).
- **Downsample-level selection** — for large sigmas every serious implementation blurs at reduced resolution (Skia's scale-then-blur); the shared math is choosing the power-of-two level and the residual sigma. Absent, so backends will diverge on large-radius quality.
- **Color-matrix math** — 5×20 (or 4×20) matrix composition/identity/application lives in `filters/colorMatrixMath.ts`, not here. Two backends applying stacked color-matrix filters must share composition math; same layering question as margin.
- **Convolution kernel normalization/analysis** — kernel builders live in `filters/convolutionKernels.ts`; the *math* half (normalize, divisor/bias handling, separability test) is shared-backend territory.
- **Bevel geometry** — `getShadowFilterOffset` covers the offset, but bevel highlight/shadow are the offset pair (+d and −d) with type-dependent compositing; a `getBevelFilterOffsets` companion would stop backends deriving the negation and rounding independently (rounding *before* negation vs after differs for odd distances — exactly the cross-backend drift this package exists to kill).
- **Quality→passes mapping** — Flash's quality 1/2/3 → pass count convention appears to live in `filters/blurQuality.ts`; it parameterizes every function in `blurMath.ts` (`passes`) and is needed by every backend, so it sits on the wrong side of the seam.

Not counted against it: per-substrate specifics (CSS filter string building, WGSL/GLSL codegen, ImageData loops) — those correctly belong in the backend packages.

## Naming / API-shape notes

- `compute*` for pure derivations and `get*` for accessor-shaped extraction is used consistently; all four names carry their full domain words and are globally self-identifying. Good.
- `getShadowFilterOffset` takes a `DropShadowFilter | InnerShadowFilter | BevelFilter` union — as this widens (glow filters share angle/distance in Flash lineage), consider whether the honest parameter is a minimal structural `{ angle?, distance? }` `*Like` input rather than a growing union of entity types.
- The `out: { dx: number; dy: number }` inline type is anonymous; if any second function returns an offset pair, the shape should be a named type in `@flighthq/types` (`PixelOffset` or reuse an existing vector type) rather than repeated structural literals.
- The blur trio operates on bare numbers, so no type-word is required — same carve-out the `math` review applied to scalar helpers.
- **Layering inconsistency is the real shape issue:** the package description says filters-math is "depended on by the filters intents package and every filter backend," i.e. it is the bottom of the filter stack. But `colorMatrixMath`, `convolutionKernels`, `blurQuality`, and `bitmapFilterMargin` — all backend-shared math — live in `filters`, which sits above it. Either the seam means "all shared filter math lives below the descriptors" (then those four files migrate here) or the seam is only "math the descriptors themselves need" (then the description over-claims). The current split looks like extraction-in-progress, not a decided boundary.

## Recommendation

Finish the extraction the package started. First settle the seam question with `filters`: adopt "descriptor-independent filter math lives in filters-math" and migrate `colorMatrixMath`, the kernel-math half of `convolutionKernels`, `blurQuality`, and `bitmapFilterMargin` down (they are already pure, typed against `@flighthq/types`, and consumed by backends) — that single move roughly triples the package's honest coverage without writing new math. Then add the missing GPU-blur primitives in priority order: `computeGaussianKernelWeights` + kernel-size-from-sigma, the linear-sampling weight/offset pairing, and downsample-level selection for large sigmas — each is small, testable against closed-form expectations, and prevents three backends from drifting apart. `getBevelFilterOffsets` closes the shadow-geometry family. The four functions present are excellent; the package just needs to become the library its description already claims it is.

## 2026-07-09 — deepened

Gaussian kernel weights, linear-sampling bilinear-tap optimization, large-sigma downsample selection, bevel offsets (commit fae14d6c). The assessment Recommended items landed and gated green; a full re-review to reconfirm this directional score is due.
