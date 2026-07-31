import {
  applyGradientBevelEffectToWgpu,
  defaultWgpuGradientBevelEffectRunner,
  registerWgpuGradientBevelEffect,
} from './wgpuGradientBevelEffect';

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

describe('registerWgpuGradientBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGradientBevelEffect).toBeTypeOf('function');
  });
});
