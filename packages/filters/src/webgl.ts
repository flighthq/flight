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
 * Applies a bitmap filter to `source` and writes the result to `dest`.
 * Dispatches to the appropriate per-filter WebGL implementation.
 */
export function applyWebGLFilter(
  state: WebGLRenderState,
  source: WebGLRenderTarget,
  dest: WebGLRenderTarget,
  filter: BitmapFilter,
): void {
  switch (filter.type) {
    case 'bevel':
      applyWebGLBevelFilter(state, source, dest, filter);
      break;
    case 'blur':
      applyWebGLBlurFilter(state, source, dest, filter);
      break;
    case 'colorMatrix':
      applyWebGLColorMatrixFilter(state, source, dest, filter);
      break;
    case 'convolution':
      applyWebGLConvolutionFilter(state, source, dest, filter);
      break;
    case 'dropShadow':
      applyWebGLDropShadowFilter(state, source, dest, filter);
      break;
    case 'glow':
      applyWebGLGlowFilter(state, source, dest, filter);
      break;
  }
}
