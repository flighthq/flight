import type { WgpuRenderState } from '@flighthq/types';

// All per-state pipeline caches in this package live here so that
// destroyWgpuFilterPipelines can evict them in one place without requiring
// module-initialization side-effect calls in each filter file.

// wgpuBevelFilter
export const bevelCompositeCache = new WeakMap<WgpuRenderState, object>();
// wgpuBlitShader
export const blitOffsetCache = new WeakMap<WgpuRenderState, object>();
export const blitCache = new WeakMap<WgpuRenderState, object>();
// wgpuBlurFilter
export const boxBlurCache = new WeakMap<WgpuRenderState, object>();
export const gaussianBlurCache = new WeakMap<WgpuRenderState, object>();
// wgpuColorMatrixFilter
export const colorMatrixCache = new WeakMap<WgpuRenderState, object>();
// wgpuConvolutionFilter
export const convolutionCache = new WeakMap<WgpuRenderState, object>();
// wgpuDisplacementMapFilter
export const displacementMapCache = new WeakMap<WgpuRenderState, object>();
// wgpuGradientBevelFilter
export const gradientBevelEncodeCache = new WeakMap<WgpuRenderState, object>();
export const gradientBevelApplyCache = new WeakMap<WgpuRenderState, object>();
// wgpuGradientGlowFilter
export const gradientGlowLookupCache = new WeakMap<WgpuRenderState, object>();
// wgpuMedianFilter
export const medianCache = new WeakMap<WgpuRenderState, object>();
// wgpuPixelateFilter
export const pixelateCache = new WeakMap<WgpuRenderState, object>();
// wgpuSharpenFilter
export const sharpenCache = new WeakMap<WgpuRenderState, object>();
// wgpuTintShader
export const tintCache = new WeakMap<WgpuRenderState, object>();
export const invertTintCache = new WeakMap<WgpuRenderState, object>();
export const innerClipCache = new WeakMap<WgpuRenderState, object>();

export const ALL_WGPU_FILTER_PIPELINE_CACHES: ReadonlyArray<WeakMap<WgpuRenderState, object>> = [
  bevelCompositeCache,
  blitOffsetCache,
  blitCache,
  boxBlurCache,
  gaussianBlurCache,
  colorMatrixCache,
  convolutionCache,
  displacementMapCache,
  gradientBevelEncodeCache,
  gradientBevelApplyCache,
  gradientGlowLookupCache,
  medianCache,
  pixelateCache,
  sharpenCache,
  tintCache,
  invertTintCache,
  innerClipCache,
];
