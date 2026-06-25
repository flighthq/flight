/**
 * Returns the number of scratch render targets required by `applyBevelFilterToGl`.
 * Callers must allocate at least this many targets of the same dimensions as `dest`
 * before invoking the filter.
 */
export function getBevelFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyColorMatrixFilterToGl`.
 * The color-matrix filter is a single GPU pass — no scratch targets needed.
 */
export function getColorMatrixFilterGlScratchCount(): number {
  return 0;
}

/**
 * Returns the number of scratch render targets required by `applyConvolutionFilterToGl`.
 * The convolution filter is a single GPU pass — no scratch targets needed.
 */
export function getConvolutionFilterGlScratchCount(): number {
  return 0;
}

/**
 * Returns the number of scratch render targets required by `applyDisplacementMapFilterToGl`.
 * The displacement map filter is a single GPU pass — no scratch targets needed.
 */
export function getDisplacementMapFilterGlScratchCount(): number {
  return 0;
}

/**
 * Returns the number of scratch render targets required by `applyDropShadowFilterToGl`.
 */
export function getDropShadowFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyGradientBevelFilterToGl`.
 */
export function getGradientBevelFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyGradientGlowFilterToGl`.
 */
export function getGradientGlowFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyInnerGlowFilterToGl`.
 */
export function getInnerGlowFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyInnerShadowFilterToGl`.
 */
export function getInnerShadowFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyMedianFilterToGl`.
 * The median filter is a single GPU pass — no scratch targets needed.
 */
export function getMedianFilterGlScratchCount(): number {
  return 0;
}

/**
 * Returns the number of scratch render targets required by `applyOuterGlowFilterToGl`.
 */
export function getOuterGlowFilterGlScratchCount(): number {
  return 3;
}

/**
 * Returns the number of scratch render targets required by `applyPixelateFilterToGl`.
 * The pixelate filter is a single GPU pass — no scratch targets needed.
 */
export function getPixelateFilterGlScratchCount(): number {
  return 0;
}

/**
 * Returns the number of scratch render targets required by `applySharpenFilterToGl`.
 * Note: sharpen uses two targets (blurred, blur ping-pong temp), not three.
 */
export function getSharpenFilterGlScratchCount(): number {
  return 2;
}
