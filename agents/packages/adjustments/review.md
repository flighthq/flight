---
package: '@flighthq/adjustments'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source
  - effect-adjustment-architecture.md
---

# adjustments — Review

Re-review of the package following the prior 2026-07-13 survey. Evidence is the live tree (`packages/adjustments/src/`, 18 source modules + `index.ts`/`contract.ts`, 19 colocated test files, 120 tests passing) plus its consumers in `node`, `render`, `effects-gl`/`effects-wgpu`/`effects-canvas`, and the GPU draw paths in `scene2d-gl`/`scene2d-wgpu`. Since the prior review: `createTintAdjustment` and `createColorScaleBiasAdjustment` were added, `createColorMatrixAdjustment` was promoted to the public lane, and the contract-lane split landed.

## Verdict

**solid — 82/100.** Both fuse tiers are mature and well-tested. The matrix tier provides a complete 4x5 builder/combinator/evaluator bench (17 `create*ColorMatrix` builders plus `multiplyColorMatrix`/`concatColorMatrix`/`fuseColorMatrices`, all alias-safe). The LUT tier (`bakeColorLut`, `sampleColorLut`, content-signature cache) composes arbitrary pointwise stacks into one trilinear-sampled 3D LUT. Fourteen `create*Adjustment` descriptors now cover the pointwise catalog with open structural detection -- any object carrying a valid `colorMatrix` or `transform` fuses without registration. The score rises slightly from 80 because of the tint and color-scale-bias additions and the clean contract-lane split, but the same structural gaps from the prior review persist: no realization seam / `explain*` diagnostics, missing standalone descriptors for several matrix-builder presets, white balance still authored as an Effect, and the `ColorScaleBias` primitive still hosted in `@flighthq/materials`.

## Present capabilities

### Matrix tier (`colorMatrixMath.ts`, 465 lines)
- `applyColorMatrixToColor` -- evaluates a 4x5 matrix against a packed `0xRRGGBBAA` color; the unit-test oracle.
- `concatColorMatrix`/`multiplyColorMatrix` -- out-param composition, alias-safe (all inputs read into locals before writing).
- `fuseColorMatrices` -- left-to-right stack composition; identity on empty.
- 17 `create*ColorMatrix` builders: brightness, contrast, saturation, desaturate, grayscale (BT.601), hue-rotate, invert, sepia, tint, channel-mixer, color-balance, levels, opacity, white-balance, technicolor, polaroid, vintage, plus `createIdentityColorMatrix`.
- `COLOR_MATRIX_LENGTH` constant (20).

### LUT tier (`colorLut.ts`, `colorLutCache.ts`, `colorLutAdjustment.ts`)
- `bakeColorLut` -- composes a stack of `ColorTransformFunction`s into one 3D LUT (`O(size^3)`, default 32^3). Identity for an empty stack.
- `sampleColorLut` -- trilinear CPU sampler, the counterpart of the GPU 3D texture tap.
- `COLOR_LUT_DEFAULT_SIZE` constant (32).
- `bakeColorLutForRun` + `createColorLutCache` -- content-signature bake memo (keys on `JSON.stringify` of the run, correctly excluding the function-valued `transform`); returns a stable `ColorLut` reference so GPU-upload caches can skip re-uploading by identity.
- `getAdjustmentColorTransform` -- returns the `rgb->rgb` transform for any pointwise adjustment; matrix-tier members are wrapped as opaque-alpha transforms so mixed runs bake into one LUT.
- `isColorLutAdjustment` -- type guard for LUT-tier membership.

### Adjustment descriptors (14 `create*Adjustment` factories)
Matrix-tier (carry `colorMatrix`):
1. `createBrightnessContrastAdjustment` -- shift + scale about mid-grey; identity at brightness 0, contrast 1.
2. `createChannelMixerAdjustment` -- 3x4 row-major RGB->RGB mix with per-row bias.
3. `createColorBlindSimulationAdjustment` -- all 8 `ColorBlindType`s (HCIRN/Wickline matrices).
4. `createColorMatrixAdjustment` -- generic user-supplied 4x5 matrix.
5. `createColorScaleBiasAdjustment` -- explicit per-channel scale/bias, carries both the `ColorScaleBias` payload and the derived diagonal matrix.
6. `createExposureAdjustment` -- `2^exposure` diagonal scale (SDR, clamped).
7. `createGrayscaleAdjustment` -- BT.709 luma desaturation with `intensity` mix.
8. `createInvertAdjustment` -- `mix(rgb, 1-rgb, intensity)` affine.
9. `createSepiaAdjustment` -- standard sepia matrix with `intensity` mix.
10. `createTintAdjustment` -- packed `0xRRGGBBAA` -> diagonal-affine tint, one authored value.

LUT-tier (carry `transform`):
11. `createColorGradeAdjustment` -- full grade (exposure/brightness/temperature/tint/saturation/contrast + lift/gamma/gain).
12. `createHueSaturationAdjustment` -- HSL round-trip with hue rotation, saturation scale, lightness offset.
13. `createLiftGammaGainAdjustment` -- per-channel power curve from packed RGBA neutrals.
14. `createLookupTableGradeAdjustment` -- carries a supplied `ColorLut`, mixes by `strength`.

### Resolution and inline fold (`colorAdjustmentResolution.ts`)
- `resolveColorAdjustmentsColorMatrix` -- fuses an entire matrix-tier stack to one 4x5 matrix; returns `null` if any member is non-matrix.
- `resolveColorAdjustmentsColorScaleBias` -- fuses a stack into one 8-float `ColorScaleBias` for the inline fold and returns a status constant: `COLOR_ADJUSTMENT_NONE` (empty), `COLOR_ADJUSTMENT_AFFINE` (diagonal-only, exact fold), or `COLOR_ADJUSTMENT_CHANNEL_MIXING` (off-diagonal terms present, the affine part is extracted but the full matrix is needed).
- `isAffineColorMatrix` -- exact zero check on off-diagonal coefficients.

### Structural detection (open, no per-kind switch)
- `getAdjustmentColorMatrix` / `isColorMatrixAdjustment` -- any object with a valid 20-length `colorMatrix` array is recognized as matrix-tier.
- `getAdjustmentColorTransform` / `isColorLutAdjustment` -- any object with a function-valued `transform` is recognized as LUT-tier.
- Third-party adjustment kinds fuse without registration.

### Export lanes
- Public lane (`.` / `index.ts`): 40 named exports covering the descriptor factories, matrix builders, fuse/resolution functions, and constants.
- Contract lane (`./contract` / `contract.ts`): full surface re-exported via barrel.

### Test coverage
- 19 test files, 120 tests, all passing.
- `colorMatrixMath.test.ts` (431 lines, 55 tests) is the deepest -- covers every builder, composition, identity, alias-safety, edge values.
- `colorAdjustmentResolution.test.ts` (89 lines, 9 tests) covers the three resolution states and mixed stacks.
- `colorLutCache.test.ts` (61 lines, 6 tests) covers cache hit/miss, signature stability, and invalidation.
- Thinner tests: `colorScaleBiasAdjustment.test.ts` (1 test, 21 lines), `sepiaAdjustment.test.ts` (2 tests), `exposureAdjustment.test.ts` (3 tests). These verify `kind`, identity defaults, and one non-trivial color sample but lack edge-case and aliased-out coverage.

### Contract hygiene
- Sole dependency: `@flighthq/types`.
- `"sideEffects": false`.
- Two-lane exports (`.` and `./contract`).
- Types defined in `@flighthq/types` (14 specific Adjustment interfaces, `ColorLut`, `ColorLutCache`, `ColorTransformFunction`, `AdjustmentKind`, `ColorBlindType`).

## Gaps

1. **No realization seam or diagnostics.** The charter's north star says "presence of a `(kind, backend)` realization **is** the support matrix; a missing one returns the sentinel and `explainEffectRealization` explains it." No `explainAdjustmentRealization`, no `(kind, backend)` registry, and no `explain*` query exists anywhere in the tree. The status doc confirms this as the bedrock missing piece.

2. **Matrix builders without corresponding descriptors.** `colorMatrixMath.ts` exports builders for `colorBalance`, `desaturate`, `levels`, `opacity`, `polaroid`, `technicolor`, and `vintage`, and none of the seven has a `create*Adjustment` descriptor or a kind in `@flighthq/types`. A caller can only reach them by hand-building a `ColorMatrixAdjustment` via `createColorMatrixAdjustment(createPolaroidColorMatrix())`. The charter's north star explicitly names `ColorBalance` as a descriptor kind.

3. **White balance still authored as an Effect.** `createWhiteBalanceColorMatrix` lives in `adjustments/src/colorMatrixMath.ts` (linear, pointwise), while `whiteBalanceEffect.ts` plus dedicated backend passes live in `@flighthq/effects` and `effects-gl`/`effects-wgpu`/`effects-canvas`. A pointwise-linear op realized as a chain-and-bounce Effect pass is exactly the category error the fork-H dissolution addressed. The status doc notes this as an open migration item.

4. **`ColorScaleBias` primitive still in `@flighthq/materials`.** `materials/src/colorScaleBias.ts` (16 exports: `createColorScaleBias`, `concatColorScaleBias`, `copyColorScaleBias`, `equalsColorScaleBias`, etc.) is the affine payload this tier's inline fold consumes. `node/src/nodeColorAdjustment.ts` and `render/src/enableColorAdjustments.ts` import it from `materials`. The charter's architecture has materials shrinking to shading kinds only, so this primitive is in the wrong cell. The status doc flags this explicitly.

5. **Tone map still in Effects.** `toneMapEffect.ts` in the effects package is continuous pointwise and LUT-bakeable per the status doc. Like white balance, it is a candidate for migration to the adjustment tier.

6. **Thin tests on some descriptors.** `colorScaleBiasAdjustment.test.ts` (1 test), `sepiaAdjustment.test.ts` (2 tests), and `exposureAdjustment.test.ts` (3 tests) verify basic construction and one color sample but lack edge-case coverage (e.g., extreme parameter values, composition with other adjustments). The `colorMatrixMath.test.ts` is excellent by comparison.

7. **No `adjustments-surface` / `adjustments-css` backends.** The charter names both as standalone backend realizations; neither package exists. The canvas ImageData pass in `effects-canvas` covers the CPU pipeline case, but there is no surface-level or CSS-property realization.

8. **LUT-tier serialization seam.** LUT-tier adjustments carry a `transform` closure fully determined by serialized params, and the cache signature correctly excludes it via `JSON.stringify`. But a parsed-back descriptor loses its transform -- there is no `rehydrate`/factory-by-kind path for scene round-tripping. No scene serialization exists SDK-wide yet, so this is a noted future seam rather than a defect.

9. **Single-slot LUT cache.** `ColorLutCache` holds one `signature`/`lut` pair. Two alternating stacks in one pipeline would re-bake `size^3` cells every frame. Fine for the common single-stack case but worth noting.

10. **Duplicated `clamp01` and `unpackRgb` helpers.** `clamp01` appears in `colorLut.ts`, `colorGradeAdjustment.ts`, `hueSaturationAdjustment.ts`, and `liftGammaGainAdjustment.ts` as four separate private functions. `unpackRgb` is duplicated between `colorGradeAdjustment.ts` and `liftGammaGainAdjustment.ts`. These are trivially small, and keeping them private avoids an export, so this is more a tidiness note than a real gap.

## Charter contradictions

None found. The code is faithful to the three blessed decisions:

- **Adjustments are data-fed** -- no shader snippets anywhere; every adjustment is a plain-data descriptor with a `colorMatrix` or `transform` field.
- **Stacks fuse to one matrix/LUT before realization** -- verified in the resolution functions and confirmed by all three effect pipeline consumers.
- **A stack is a plain `readonly Adjustment[]`** -- no wrapper type, no container noun.
- **Deps are `@flighthq/types` only** -- confirmed in `package.json`.
- **`sideEffects: false`** -- no top-level registration or mutation.

The gaps above are chartered surface that is not yet built, not violations of built surface.

## Contract & docs fit

**Lives up to the contract:**
- Types-first: all 14+ Adjustment interfaces, `ColorLut`, `ColorLutCache`, `ColorTransformFunction`, `AdjustmentKind`, `ColorBlindType` are in `@flighthq/types`.
- Full unabbreviated function names throughout (`createBrightnessContrastAdjustment`, not `createBCAdjustment`).
- Out-params alias-safe and tested aliased (`multiplyColorMatrix` reads all inputs into locals).
- Sentinels not throws: `getAdjustmentColorMatrix` returns `null`, `resolveColorAdjustmentsColorMatrix` returns `null` for non-matrix stacks.
- `sideEffects: false`; two-lane exports.
- Every export has a colocated test.

**Candidate doc revisions:**
- (a) The status doc's `Open` section was last re-checked 2026-08-08 and correctly documents the three open items (realization seam, two unsorted effects, descriptor catalog gap, ColorScaleBias location). It is up to date.
- (b) The Package Map line in `AGENTS.md` groups `adjustments` under "image operations (`materials` + `shading` / `adjustments` / `effects` ...)" which is accurate.

## Candidate open directions

1. **Seed the realization seam now or defer?** The `(kind, backend)` registry + `explainAdjustmentRealization` is chartered and named in the status doc as "the one bedrock piece still missing." With 14 descriptor kinds and three consuming pipelines, the catalog arguably justifies building it.
2. **Descriptor completion policy.** Seven matrix builders (`colorBalance`, `desaturate`, `levels`, `opacity`, `polaroid`, `technicolor`, `vintage`) have no corresponding `create*Adjustment` descriptor. Are these distinct kinds, or is the guidance "compose via `createColorMatrixAdjustment(builder(...))`"? The charter names `ColorBalance` explicitly.
3. **White balance and tone map re-sort.** Both are pointwise-linear or continuous-pointwise ops still authored as Effects with dedicated backend passes. Sorting them to adjustments would finish the fork-H migration step 3.
4. **`ColorScaleBias` home.** The primitive that powers the inline fold lives in `@flighthq/materials`. It is the adjustment tier's own affine payload and should move to either `adjustments` or `math`/`color`.
5. **Inline 4x5 stage** (charter Open direction 2). The one decision gating full node-path folding of channel-mixing stacks (saturation, hue, sepia, channel-mixer).
6. **LUT-tier rehydration.** When scene serialization lands, adjustments needs a `kind -> factory` rebake path for `transform`-carrying descriptors.
