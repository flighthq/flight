# adjustments — Status

Continuity log for `@flighthq/adjustments`. See [charter](charter.md) and the SDK-wide [effect-adjustment-architecture](../../effect-adjustment-architecture.md).

## Built (2026-07-11, fork H migration)

- Package created (modeled on `effects`); `Adjustment` + `AdjustmentKind` header types in `@flighthq/types`.
- **Color-matrix fuse primitives** ported from the dissolved `filters` (`colorMatrixMath.ts`): `concatColorMatrix`/`multiplyColorMatrix` (out-param, alias-safe) + `applyColorMatrixToColor` + the builder set (brightness/contrast/saturation/desaturate/tint/channel-mixer/color-balance/hue-rotate/invert/grayscale/sepia/levels/opacity/white-balance/technicolor/polaroid/vintage + identity). A stack of matrix-tier adjustments fuses to one 4×5 matrix.
- **Color transform** realized as a `HasColorTransform` node trait folded into the sprite/quad batch (Phase 2): promote-not-split `NONE → UNIFORM → PER_INSTANCE` state machine, per-instance `a_ctMult`/`a_ctOff` (loc 7/8) or whole-batch `u_ctMult`/`u_ctOff` uniform chosen by data cardinality. `ColorTransformMaterial`/`UniformColorTransformMaterial` removed from types + materials + gl + wgpu. Fixed a latent bug: the CT material renderers were never in the default bundle, so tinted `bitmaptext` drew untinted; the fold makes tinting work.

## Next (blessed, not yet done)

- **Phase 3 — re-sort the pointwise effects into here.** `colorGrade`, `hueSaturation`, `brightnessContrast`, `invert`, `grayscale`, `liftGammaGain`, `channelMixer`, `exposure`, `lookupTableGrade`, `colorBlindSimulation` (and tone-map/posterize/sepia if pointwise) currently live in `@flighthq/effects` as full-frame passes. Move descriptor+realization so a stack **fuses** to one matrix (or one baked LUT) instead of N passes. **Open mechanism:** whether pointwise adjustments get their own `adjustments-{gl,wgpu,canvas,surface}` pass backends, or the effects pipeline gains a fuse step that collapses consecutive matrix/LUT adjustments — a genuine design fork to settle before building (see the proposal).
- **LUT tier.** A LUT baker (compose a stack of `rgb→rgb` functions into one cached 3D LUT) for the nonlinear pointwise ops; the matrix tier exists, the LUT tier does not yet.
- **Realization seam.** The `(kind, backend)` registry + `explainAdjustmentRealization` (deferred from Phase 2 per fork B — the ColorTransform fold dispatches on the trait directly; the registry earns its keep once the multi-kind pointwise catalog lands in Phase 3).
- **`create*Adjustment` descriptors.** None yet — the package is currently fuse-math + the trait fold. The descriptors arrive with Phase 3.

## Transient state to clear

- None outstanding. The Phase-1 duplication with `filters` (the barrel re-export block + `DROP_IN_PACKAGES` allowlist) was removed when `filters*` was deleted.
