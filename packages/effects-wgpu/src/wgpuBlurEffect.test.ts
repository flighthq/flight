import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';

import {
  getWgpuRenderTargetTexelScale,
  applyBlurEffectToWgpu,
  applyGaussianBlurToWgpu,
  defaultWgpuBlurEffectRunner,
  registerWgpuBlurEffect,
} from './wgpuBlurEffect';
import { getWgpuRenderEffectRunner } from './wgpuRenderEffectRegistry';

beforeAll(() => installWgpuMock());

describe('applyBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToWgpu).toBe('function');
  });
});

describe('applyGaussianBlurToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGaussianBlurToWgpu).toBe('function');
  });
});

describe('defaultWgpuBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBlurEffectRunner).toBe('function');
  });
});

describe('getWgpuRenderTargetTexelScale', () => {
  // ★ THE DEFECT: sigma is in logical pixels, the pass steps in texels, and a supersampled effect target
  // holds two texels per logical pixel. Every blur-based Wgpu effect ran half as wide as its Gl twin.
  // Measured on effect-bloom, halo mean wgpu-webgl: -15.87 before, +1.12 after, with 41% of halo pixels
  // darker and 0% brighter beforehand — one-directional, which is a too-narrow blur rather than a
  // different one.
  it('reports 2 for a supersampled target and 1 at native density', () => {
    expect(getWgpuRenderTargetTexelScale(1600, 800)).toBe(2);
    expect(getWgpuRenderTargetTexelScale(800, 800)).toBe(1);
  });

  // A target SMALLER than the canvas is a downsampled chain, not a negative supersample: scaling sigma
  // below its authored value would narrow the blur further, so the factor floors at 1.
  it('never scales below 1', () => {
    expect(getWgpuRenderTargetTexelScale(400, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(1, 800)).toBe(1);
  });

  // Degenerate inputs return the identity rather than NaN or Infinity: a bad scale silently multiplies
  // sigma and the failure would surface as a wrong picture rather than an error.
  it('returns 1 for a zero or non-finite width instead of propagating it', () => {
    expect(getWgpuRenderTargetTexelScale(800, 0)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(Number.NaN, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(800, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('registerWgpuBlurEffect', () => {
  it('registers the default runner under BlurEffect', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuBlurEffect(state);
    expect(getWgpuRenderEffectRunner(state, 'BlurEffect')).toBe(defaultWgpuBlurEffectRunner);
  });
});
