import { applyMedianEffectToWgpu, defaultWgpuMedianEffectRunner, registerWgpuMedianEffect } from './wgpuMedianEffect';

describe('applyMedianEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuMedianEffectRunner).toBe('function');
  });
});

describe('registerWgpuMedianEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuMedianEffect).toBeTypeOf('function');
  });
});
