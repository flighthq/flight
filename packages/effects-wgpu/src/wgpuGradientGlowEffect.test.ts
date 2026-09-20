import {
  applyGradientGlowEffectToWgpu,
  wgpuGradientGlowEffectRunner,
  registerWgpuGradientGlowEffect,
} from './wgpuGradientGlowEffect';

describe('applyGradientGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGradientGlowEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuGradientGlowEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGradientGlowEffect).toBeTypeOf('function');
  });
});

describe('wgpuGradientGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuGradientGlowEffectRunner).toBe('function');
  });
});
