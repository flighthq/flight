import { applyGradientBevelEffectToWgpu, defaultWgpuGradientBevelEffectRunner } from './wgpuGradientBevelEffect';

describe('applyGradientBevelEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGradientBevelEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGradientBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGradientBevelEffectRunner).toBe('function');
  });
});
