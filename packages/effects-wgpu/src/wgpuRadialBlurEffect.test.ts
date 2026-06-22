import { applyRadialBlurEffectToWgpu, defaultWgpuRadialBlurEffectRunner } from './wgpuRadialBlurEffect';

describe('applyRadialBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuRadialBlurEffectRunner).toBe('function');
  });
});
