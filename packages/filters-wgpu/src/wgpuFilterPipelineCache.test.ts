import {
  ALL_WGPU_FILTER_PIPELINE_CACHES,
  bevelCompositeCache,
  blitCache,
  blitOffsetCache,
  boxBlurCache,
  colorMatrixCache,
  convolutionCache,
  displacementMapCache,
  gaussianBlurCache,
  gradientBevelApplyCache,
  gradientBevelEncodeCache,
  gradientGlowLookupCache,
  innerClipCache,
  invertTintCache,
  medianCache,
  pixelateCache,
  sharpenCache,
  tintCache,
} from './wgpuFilterPipelineCache';

describe('ALL_WGPU_FILTER_PIPELINE_CACHES', () => {
  it('contains every per-filter pipeline cache', () => {
    const expected = [
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
    expect(ALL_WGPU_FILTER_PIPELINE_CACHES).toHaveLength(expected.length);
    for (const cache of expected) {
      expect(ALL_WGPU_FILTER_PIPELINE_CACHES).toContain(cache);
    }
  });

  it('holds distinct WeakMap instances (no aliasing between caches)', () => {
    const unique = new Set(ALL_WGPU_FILTER_PIPELINE_CACHES);
    expect(unique.size).toBe(ALL_WGPU_FILTER_PIPELINE_CACHES.length);
  });
});
