import { applyFxaaEffectToWgpu, wgpuFxaaEffectRunner, registerWgpuFxaaEffect } from './wgpuFxaaEffect';

describe('applyFxaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuFxaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuFxaaEffect).toBeTypeOf('function');
  });
});

describe('wgpuFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuFxaaEffectRunner).toBe('function');
  });
});
