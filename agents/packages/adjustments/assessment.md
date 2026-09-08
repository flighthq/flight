---
package: '@flighthq/adjustments'
updated: 2026-09-08
basedOn: ./review.md
---

# adjustments — Assessment

Sorted from the 2026-09-02 review (`review.md`). All 10 review gaps verified open against source 2026-09-08. 131 test cases across 19 test files. 14 descriptor factories, 17 matrix builders.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/adjustments`, no unresolved design decision.

- **Complete the descriptor catalog.** 7 matrix builders lack `create*Adjustment` descriptors: `colorBalance`, `desaturate`, `levels`, `opacity`, `polaroid`, `technicolor`, `vintage`. Charter explicitly names `ColorBalance`. Callers must hand-build via `createColorMatrixAdjustment(create*ColorMatrix())`.
- **Deepen thin descriptor tests.** `colorScaleBiasAdjustment.test.ts` has 2 tests, `sepiaAdjustment.test.ts` has 3, `exposureAdjustment.test.ts` has 4. Lack edge-case and composition coverage compared to `colorMatrixMath.test.ts` at 55 tests.
- **Extract duplicated `clamp01` helper.** Repeated in 4 source files. A shared internal utility would reduce duplication without tree-shaking cost.

## Depth gaps

1. **No realization seam.** No `(kind, backend)` registry or `explainAdjustmentRealization` exists. This is the bedrock gap — it blocks backend-support generation and the `explain*` diagnostic pattern. Needs a design decision on whether the realization seam lives here or in the backend packages.
2. **White balance still authored as an Effect.** `whiteBalanceEffect.ts` lives in `@flighthq/effects`. It is a continuous pointwise op (adjustment-tier math) with backend passes (effect-tier realization). Migration would finish the architecture's fork-H step 3. Cross-package.
3. **Tone map still in Effects.** Same pattern as white balance — continuous, LUT-bakeable, not yet migrated. Cross-package.
4. **`ColorScaleBias` primitive in `@flighthq/materials`.** The adjustment tier's own affine payload (16 exports) lives in the wrong cell per the architecture. Cross-package.
5. **No `adjustments-surface` / `adjustments-css` backend packages.** Chartered but do not exist.
6. **LUT-tier serialization/rehydration seam.** No scene serialization exists SDK-wide yet. Not a current defect.
7. **Single-slot LUT cache.** Architectural note; not a defect for the common single-stack case.

## Backlog

_None._

## Approved

_None._
