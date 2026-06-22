import { applyDirectionalBlurEffectToWgpu, defaultWgpuDirectionalBlurEffectRunner } from './wgpuDirectionalBlurEffect';

describe('applyDirectionalBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDirectionalBlurEffectRunner).toBe('function');
  });
});
