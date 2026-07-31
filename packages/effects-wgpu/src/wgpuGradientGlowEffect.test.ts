import {
  applyGradientGlowEffectToWgpu,
  defaultWgpuGradientGlowEffectRunner,
  registerWgpuGradientGlowEffect,
} from './wgpuGradientGlowEffect';

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

describe('registerWgpuGradientGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGradientGlowEffect).toBeTypeOf('function');
  });
});
