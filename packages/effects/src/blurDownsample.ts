// Scale-then-blur downsample selection for large blurs. Substrate-agnostic recipe math.
//
// Copied verbatim from filters-math during the filters→effects migration — effects is the
// canonical home for the spatial-effect blur math (effect-adjustment-architecture.md, migration
// step 4). filters-math keeps its copy until the filters* packages retire; the duplicate is
// deliberate for the duration (mirrors the Phase 1 colorMatrixMath port).

/**
 * Returns the power-of-two downsample level to apply before blurring with standard deviation
 * `sigma`, following Skia's scale-then-blur strategy: large blurs are cheaper if the source is first
 * halved in each dimension `level` times and blurred with a proportionally smaller residual sigma.
 * The level is the smallest non-negative integer such that `sigma / 2^level` falls at or below
 * `BLUR_DOWNSAMPLE_MAX_SIGMA`, i.e. `ceil(log2(sigma / max))` clamped to `>= 0`. Blurs at or below
 * that threshold run at full resolution (level 0). `sigma <= 0` returns 0.
 */
export function getBlurDownsampleLevel(sigma: number): number {
  if (sigma <= BLUR_DOWNSAMPLE_MAX_SIGMA) return 0;
  return Math.ceil(Math.log2(sigma / BLUR_DOWNSAMPLE_MAX_SIGMA));
}

/**
 * Returns the residual standard deviation to blur with after downsampling by `level` power-of-two
 * steps: `sigma / 2^level`. Blurring a `2^level`-times-downsampled image with this residual sigma
 * reproduces a full-resolution blur of `sigma`, because a blur at half resolution covers twice the
 * distance in source space. `sigma <= 0` returns 0.
 */
export function getBlurResidualSigma(sigma: number, level: number): number {
  if (sigma <= 0) return 0;
  return sigma / 2 ** level;
}

// The largest residual sigma a downsample level is allowed to leave. Matches Skia's GPU blur cap:
// beyond ~4 the box/Gaussian passes gain little accuracy per pixel touched, so halving resolution
// and blurring the smaller image is the better trade.
const BLUR_DOWNSAMPLE_MAX_SIGMA = 4;
