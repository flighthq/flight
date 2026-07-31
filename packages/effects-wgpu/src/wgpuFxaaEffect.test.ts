import { applyFxaaEffectToWgpu, defaultWgpuFxaaEffectRunner, registerWgpuFxaaEffect } from './wgpuFxaaEffect';

describe('applyFxaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuFxaaEffectRunner).toBe('function');
  });
});

describe('registerWgpuFxaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuFxaaEffect).toBeTypeOf('function');
  });
});
