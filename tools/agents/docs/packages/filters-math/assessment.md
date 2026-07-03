---
package: '@flighthq/filters-math'
updated: 2026-07-03
basedOn: ./review.md
---

# filters-math — Assessment

Based on the 2026-07-03 review (partial, 30/100) — the depth review the charter's Decision #1 called for now exists, answering both charter Open directions: the package is a well-cut cross-backend blur/offset math primitive (four exports, correct Kovesi-style variance math), and yes, it overlaps with math still living above it in `@flighthq/filters` (`colorMatrixMath`, `convolutionKernels`, `blurQuality`, `bitmapFilterMargin`). That seam question is the package's real design fork and is parked below; the Recommended items are the purely additive GPU-blur primitives the review says every backend needs and would otherwise re-derive locally.

## Recommended

Sweep-safe: within `@flighthq/filters-math`, additive pure math, testable against closed-form expectations, no open design decision.

1. **Gaussian kernel weight generation.** `computeGaussianKernelWeights(sigma, out)` (1D normalized weights) plus the kernel-size-from-sigma rule (`ceil(3σ)·2+1` support cutoff) with truncated/renormalized tail handling. The conspicuous absence: every GPU backend shipping a true-Gaussian path needs exactly this, and today it would be written in-backend — the duplication this package exists to prevent.

2. **Linear-sampling weight/offset pairing.** The standard GPU optimization (pairing taps via bilinear sampling: N taps → N/2+1 weights + offsets) — the canonical shared-blur-math export for the gl/wgpu backends.

3. **Downsample-level selection for large sigmas.** Choose the power-of-two reduction level and the residual sigma (Skia's scale-then-blur), so backends do not diverge on large-radius quality.

4. **`getBevelFilterOffsets`.** The +d/−d offset pair companion to `getShadowFilterOffset`, with one rounding rule (round-before-negate vs after differs for odd distances — exactly the cross-backend drift this package exists to kill). Introduce a named offset type in `@flighthq/types` (per the header-first rule) instead of repeating the anonymous `{ dx, dy }` structural literal.

5. **Package Map entry.** Per charter Decision #3, the filter/effect backend packages — including this one — are absent from the codebase map; add the description.

## Backlog

- **Settle the seam with `@flighthq/filters` and migrate the shared math down.** Adopt "descriptor-independent filter math lives in filters-math" and move `colorMatrixMath`, the kernel-math half of `convolutionKernels` (normalize, divisor/bias, separability test), `blurQuality` (quality→passes mapping that already parameterizes every function here), and `bitmapFilterMargin` — already pure and typed against `@flighthq/types`. Roughly triples honest coverage without new math, and the current split reads as extraction-in-progress, not a decided boundary. _Parked — design decision / cross-package (moves files out of `filters` and repoints its consumers); candidate Open direction for the charter._
- **`getShadowFilterOffset` input shape.** As the entity union (`DropShadowFilter | InnerShadowFilter | BevelFilter`) widens (glow filters share angle/distance), consider a minimal structural `{ angle?, distance? }` `*Like` parameter instead of a growing union. _Parked — API-shape decision; revisit when the union grows._

## Approved

None.
