---
package: '@flighthq/adjustments'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - status.md
  - charter.md
  - source
  - effect-adjustment-architecture.md
---

# adjustments — Review

First review of the package born from the fork-H filters dissolution. Evidence is the live tree (`packages/adjustments/src/`, 18 modules + `index.ts`, 18 colocated test files, ~116 tests) plus its consumers (`effects-gl`/`effects-wgpu`/`effects-canvas` pipelines, `displayobject`/`node` runtime slot per status).

## Verdict

**solid — 80/100.** The two fuse tiers the charter demands both exist and are genuinely good: the matrix tier (a full 4×5 builder/combinator/evaluator bench, alias-safe `multiplyColorMatrix`/`concatColorMatrix`, order-preserving `fuseColorMatrices`) and the LUT tier (`bakeColorLut` composing a stack of `rgb→rgb` transforms into one trilinear-sampled 3D LUT, plus a content-signature bake memo). Thirteen `create*Adjustment` descriptors cover the pointwise catalog, structural detection is open (any object carrying a valid `colorMatrix` or `transform` fuses — third-party kinds included, no per-kind switch), and all three effect backends consume one shared fuse. What holds it below higher solid is charter-promised surface that is still absent: the `(kind, backend)` realization seam / `explain*` diagnostics, a handful of catalog descriptors, and the deferred 4×5 inline fold that leaves channel-mixing stacks only partially folded on the node path.

## Present capabilities

- **Matrix tier.** `colorMatrixMath.ts` (465 lines): `applyColorMatrixToColor` (the unit-test oracle), `concatColorMatrix`/`multiplyColorMatrix` (out-param, alias-safe), `fuseColorMatrices`, and 17 `create*ColorMatrix` builders (brightness, contrast, saturation, desaturate, grayscale BT.601, hue-rotate, invert, sepia, tint, channel-mixer, color-balance, levels, opacity, white-balance, technicolor, polaroid, vintage, identity). Flash 0–255 offset-column convention documented at the top and honored everywhere.
- **LUT tier.** `bakeColorLut` (identity for an empty stack, `O(size³)` CPU bake, default 32³), `sampleColorLut` (trilinear, clamped, the CPU counterpart of the GPU 3D tap), `bakeColorLutForRun` + `createColorLutCache` (content-signature memo via `JSON.stringify` — function-valued `transform` correctly excluded — returning a stable `ColorLut` reference so GPU upload caches can skip by identity).
- **Descriptors (13).** Matrix-tier: `createColorTransformAdjustment` (the 8-field CT baked to a diagonal-affine matrix — no longer privileged), `createBrightnessContrastAdjustment`, `createChannelMixerAdjustment`, `createExposureAdjustment` (clamped SDR), `createInvertAdjustment`, `createGrayscaleAdjustment` (BT.709, matching the old shader), `createSepiaAdjustment`, `createColorBlindSimulationAdjustment` (all 8 `ColorBlindType`s, HCIRN/Wickline matrices cited). LUT-tier: `createHueSaturationAdjustment` (faithful HSL round-trip of the old shader), `createColorGradeAdjustment` (exposure/temp/tint/saturation/contrast + LGG stage), `createLiftGammaGainAdjustment`, `createLookupTableGradeAdjustment` (carries a `ColorLut`, mixes by `strength`).
- **Open structural detection.** `getAdjustmentColorMatrix`/`isColorMatrixAdjustment` (valid 20-length `colorMatrix`) and `getAdjustmentColorTransform`/`isColorLutAdjustment` (function-valued `transform`; matrix members wrapped so mixed runs bake into one LUT). This is the fuse contract as data shape, not a kind registry — a vendor kind fuses with zero registration.
- **Affine resolution for the inline fold.** `resolveColorAdjustmentsColorTransform` fuses a node's stack to one 8-float `ColorTransform` and returns `NONE`/`AFFINE`/`CHANNEL_MIXING`; `isAffineColorMatrix` is the exact zero check. Consumed by the fuse-on-set cache on `NodeRuntime.colorAdjustments` (per status; the walk reads the cache, the fuse math stays off the base render bundle).
- **Consumers verified.** All three effect pipelines fuse a maximal run of consecutive pointwise adjustments into ONE `applyColorMatrixPassTo*` or (if any LUT-tier member) ONE `applyColorLutPassTo*` — the chain-and-bounce/fuse-and-fold seam working end to end. Functional scenes cover the moved ops (`effect-{invert,grayscale,sepia,brightness-contrast,channel-mixer,exposure,hue-saturation,color-grade,lift-gamma-gain,lut-grade}`, `color-adjustment.*`).
- **Contract hygiene.** Deps = `@flighthq/types` only; `sideEffects: false`; single root export; sentinels not throws; every module has a colocated test; the LUT continuity rule (hard-step ops are Effects, not LUT adjustments) is documented in-source at `colorLut.ts` and enforced by posterize/dither staying in `effects`.

## Gaps

- **No realization seam / diagnostics.** The charter's north star says "presence of a `(kind, backend)` realization **is** the support matrix; a missing one returns the sentinel and `explain*` explains it." No registry, no `explainAdjustmentRealization` exists (status defers it per fork B until the catalog justified it — the 13-kind catalog now arguably does). The channel-mixing deferral guard lives in `render` (`enableColorAdjustmentGuards`), but adjustments itself ships no `explain*` query.
- **Catalog descriptors missing vs the charter's list.** The north star names `Brightness`, `Contrast`, `Saturation`, `HueRotate`, and `ColorBalance` as descriptors; today they exist only as raw matrix builders (`createBrightnessColorMatrix` etc.), not as `create*Adjustment` kinds a stack can carry. There is also no generic `createColorMatrixAdjustment(matrix)` factory for a user-supplied matrix (the structural contract accepts one, but the constructor convention says users should not hand-write the literal).
- **White balance straddles the line.** `createWhiteBalanceColorMatrix` lives here (linear, pointwise) while `WhiteBalanceEffect` + three backend passes still live in the effects tier. A pointwise-linear op realized as a chain-and-bounce pass is exactly what fork H re-sorted away; this one was not in the migration list and remains unsorted.
- **4×5 inline fold deferred.** A stack whose fused matrix has off-diagonal terms cannot fold into the 8-float affine CT on the node path; only the affine part applies and a guard warns (status-documented). The charter's Open direction 2 (full-matrix inline stage vs affine-only) is the blocking decision; until then saturation/hue/sepia/channelMixer stacks are pipeline-only.
- **Serialization tension in LUT-tier descriptors.** LUT-tier adjustments carry a baked `transform` closure. The data-fed contract survives (the closure is fully determined by the serialized params, and the cache signature relies on `JSON.stringify` dropping it), but a parsed-back descriptor loses its transform — there is no `rehydrate`/factory-by-kind path for scene round-tripping. No scene serialization exists SDK-wide yet, so this is a noted seam, not a defect.
- **Single-slot LUT cache.** `ColorLutCache` holds one `signature`/`lut` pair; two alternating stacks in one pipeline re-bake `size³` cells every frame. Fine for the common one-stack case; worth an eviction note or a small keyed map when multi-stack chains appear.
- **No `adjustments-surface` / `adjustments-css` backends.** The charter names both as standalone backends; neither package exists. The canvas ImageData pass in `effects-canvas` covers the CPU case for the pipeline, but there is no surface-level (offscreen `ImageSource`) or CSS-property realization.

## Charter contradictions

None found — the code is remarkably faithful to the three blessed decisions: adjustments are data-fed (no shader snippets anywhere), stacks fuse to one matrix/LUT before realization (verified in all three pipelines), a stack is a plain `readonly Adjustment[]` (no wrapper noun), deps are types-only, and uniform-vs-per-instance is cardinality-driven in the fold (per status). The gaps above are unfinished charter surface, not violations.

## Contract & docs fit

- **Lives up to the contract:** types-first (`Adjustment`, `AdjustmentKind`, `ColorLut`, `ColorLutCache`, `ColorTransformFunction`, per-op interfaces all in `@flighthq/types`); full unabbreviated names; out-params alias-safe and tested aliased; sentinels not throws; `sideEffects: false`; single root export; every export tested.
- **Candidate doc revisions:** (a) the package's own `status.md` "Next" list is stale — hueSaturation/colorGrade/LUT tier are built, contradicting "the LUT tier does not exist yet"; a fresh status entry should record the LUT-tier landing. (b) The Package Map line for `adjustments` says "never a pass" — on CPU/pipeline substrates the fused stack *is* realized as one generic pass (`applyColorMatrixPassTo*`), which the architecture doc allows (realization shape 2); the Map line could note "one fused pass at most" to stop a literal reading. (c) `render-backend-support.md` should record that the pointwise tier is realized on all three effect-pipeline backends via the fused passes.

## Candidate open directions

1. **Seed the realization seam now or at `adjustments-surface`?** The registry + `explainAdjustmentRealization` is chartered; decide the trigger point (13 kinds today, three consuming pipelines).
2. **Descriptor completion policy.** Are `Brightness`/`Contrast`/`Saturation`/`HueRotate`/`ColorBalance` distinct kinds, or is the guidance "compose via `createColorMatrixAdjustment(builder(...))`"? Either way the catalog needs one of the two shapes.
3. **WhiteBalance re-sort** — move to an adjustment (matrix builder already here) and retire the three backend passes, or rule it stays an effect and record why.
4. **LUT-tier rehydration** — when scene serialization lands, adjustments needs a kind→factory rebake path for `transform`-carrying descriptors.
5. **Inline 4×5 stage** (charter Open direction 2) — the one decision gating full node-path folding of channel-mixing stacks.
