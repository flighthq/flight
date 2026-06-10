export { applyWebGLBevelFilter } from './webglBevelFilter';
export { applyWebGLBlurFilter } from './webglBlurFilter';
export { applyWebGLColorMatrixFilter } from './webglColorMatrixFilter';
export { applyWebGLConvolutionFilter } from './webglConvolutionFilter';
export { applyWebGLDropShadowFilter } from './webglDropShadowFilter';
export type { WebGLFilterLocations } from './webglFilterPass';
export { clearWebGLFilterTarget, compileWebGLFilterProgram, drawWebGLFilterPass } from './webglFilterPass';
export { applyWebGLGlowFilter } from './webglGlowFilter';
export { applyBlitOffsetPass, applyBlitPass, applyTintPass } from './webglTintShader';

import type { WebGLRenderTarget } from '@flighthq/render-webgl';
import type { WebGLRenderState } from '@flighthq/types';

import type { BitmapFilter } from './index';
import { applyWebGLBevelFilter } from './webglBevelFilter';
import { applyWebGLBlurFilter } from './webglBlurFilter';
import { applyWebGLColorMatrixFilter } from './webglColorMatrixFilter';
import { applyWebGLConvolutionFilter } from './webglConvolutionFilter';
import { applyWebGLDropShadowFilter } from './webglDropShadowFilter';
import { applyWebGLGlowFilter } from './webglGlowFilter';

/**
 * Applies a bitmap filter to `source` and writes the result to `dest`, using the
 * caller-provided `scratch` render targets (see webglFilterScratchCount). The
 * filters allocate nothing themselves — the caller owns the scratch lifecycle.
 * Dispatches to the appropriate per-filter WebGL implementation.
 */
export function applyWebGLFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  scratch: WebGLRenderTarget[],
  filter: BitmapFilter,
): void {
  switch (filter.type) {
    case 'bevel':
      applyWebGLBevelFilter(state, source, dest, scratch, filter);
      break;
    case 'blur':
      applyWebGLBlurFilter(state, source, dest, scratch[0], filter);
      break;
    case 'colorMatrix':
      applyWebGLColorMatrixFilter(state, source, dest, filter);
      break;
    case 'convolution':
      applyWebGLConvolutionFilter(state, source, dest, filter);
      break;
    case 'dropShadow':
      applyWebGLDropShadowFilter(state, source, dest, scratch, filter);
      break;
    case 'glow':
      applyWebGLGlowFilter(state, source, dest, scratch, filter);
      break;
  }
}

/**
 * The number of same-size scratch render targets the caller must provide for a
 * given filter via applyWebGLFilter. Allocate this many targets (of the source/
 * dest dimensions), reuse them across frames, and destroy them when done.
 */
export function webglFilterScratchCount(filter: BitmapFilter): number {
  switch (filter.type) {
    case 'colorMatrix':
    case 'convolution':
      return 0;
    case 'blur':
      return 1;
    case 'bevel':
    case 'dropShadow':
    case 'glow':
      return 3;
  }
}
