import { applyGradientGlowEffectToWgpu, defaultWgpuGradientGlowEffectRunner } from './wgpuGradientGlowEffect';

describe('applyGradientGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGradientGlowEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGradientGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGradientGlowEffectRunner).toBe('function');
  });
});
