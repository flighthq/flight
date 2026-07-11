import { applyBlurEffectToWgpu, applyGaussianBlurToWgpu, defaultWgpuBlurEffectRunner } from './wgpuBlurEffect';

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
