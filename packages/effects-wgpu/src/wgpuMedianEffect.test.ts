import { applyMedianEffectToWgpu, wgpuMedianEffectRunner, registerWgpuMedianEffect } from './wgpuMedianEffect.ts';

describe('applyMedianEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuMedianEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuMedianEffect).toBeTypeOf('function');
  });
});

describe('wgpuMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuMedianEffectRunner).toBe('function');
  });
});
