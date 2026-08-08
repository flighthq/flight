---
package: '@flighthq/adjustments'
updated: 2026-08-08
by: principal
---

# adjustments — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/adjustments/src/` on 2026-08-08. A file:line here
is a claim about this tree, not about a session.

- **The realization seam is the one bedrock piece still missing.** The ratified architecture makes
  realization *presence* the support matrix — a `(kind, backend)` registry, a sentinel for an
  unregistered cell, and `explainAdjustmentRealization` returning plain data. None of those three
  names exists anywhere in the tree. So which adjustment kinds a backend can actually fold is
  discoverable only by reading each backend, and the tier's coverage cannot be queried or generated.
- **Two continuous-pointwise ops are still authored as Effects.** `effects/src/whiteBalanceEffect.ts`
  is exactly linear and its matrix builder already lives here (`colorMatrixMath.ts:356`
  `createWhiteBalanceColorMatrix`), so it would fuse today; `effects/src/toneMapEffect.ts` is
  continuous pointwise and LUT-bakeable. Re-sorting them finishes the migration's step 3.
- **The matrix builders outrun the descriptor catalog.** `colorMatrixMath.ts` exports builders for
  `colorBalance` (`:95`), `desaturate` (`:154`), `levels` (`:235`), `opacity` (`:261`), `polaroid`
  (`:276`), `technicolor` (`:322`) and `vintage` (`:337`), and none of the seven has a
  `create*Adjustment` descriptor or a kind in `packages/types/src/`. A caller can only reach them by
  hand-building a `ColorMatrixAdjustment`.
- **`ColorScaleBias` — this tier's own affine payload — lives in `@flighthq/materials`**
  (`materials/src/colorScaleBias.ts`, 16 exports). This package depends only on `@flighthq/types`,
  but `node` and `render` import `materials` to run the adjustment path
  (`node/src/nodeColorAdjustment.ts:8`, `render/src/enableColorAdjustments.ts:2`). The architecture
  has materials shrinking to shading kinds only, so the primitive is in the wrong cell.
## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract; front matter added (the file had none).
  Three of the four "Next (blessed, not yet done)" items were already done and are dropped: the LUT
  tier exists (`colorLut.ts:25` `bakeColorLut`, `colorLutCache.ts:20` `bakeColorLutForRun`),
  `hueSaturation` and `colorGrade` both moved as LUT-tier adjustments
  (`hueSaturationAdjustment.ts:6`, `colorGradeAdjustment.ts:9`), and "`create*Adjustment` descriptors
  — none yet" is false at fifteen of them. The 4×5 channel-mixing escalation is no longer deferred
  either: `NodeRuntime.resolvedColorMatrix` feeds a real inline matrix path on both GPU backends
  (`scene2d-gl/src/glColorAdjustmentMaterialFeature.ts:855`,
  `scene2d-wgpu/src/wgpuColorAdjustmentMaterialFeature.ts:92`), with
  `colorAdjustmentsUnsupported` now narrowed to what neither path can represent.
- **2026-07-12** — ColorTransform moved off the DisplayObject entity onto the generic
  `NodeRuntime.colorAdjustments` stack; fuse-on-set caches the result so no fuse math reaches the base
  render walk (a walk-side re-fuse had cost every 2D bundle +8–17%).
- **2026-07-12** — Phase 3 second slice: `channelMixer`, `brightnessContrast`, `exposure`,
  `colorBlindSimulation` moved to baked matrices; per-op backend passes deleted; brightness/contrast
  identity corrected to `contrast 1`.
- **2026-07-11** — Phase 3 first slice: backends fuse a maximal run of consecutive matrix-tier
  adjustments into one matrix and run one generic pass; `invert`, `grayscale`, `sepia` moved.
- **2026-07-11** — Package created; `colorMatrixMath` ported from the dissolved `filters`; the
  ColorTransform fold made opt-in and tree-shakable behind
  `register{Gl,Wgpu}ColorAdjustmentMaterialFeature` after an always-on fold regressed bundle size.
