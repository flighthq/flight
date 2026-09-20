import { applyOutlineEffectToWgpu, wgpuOutlineEffectRunner, registerWgpuOutlineEffect } from './wgpuOutlineEffect';

describe('applyOutlineEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuOutlineEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuOutlineEffect).toBeTypeOf('function');
  });
});

describe('wgpuOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuOutlineEffectRunner).toBe('function');
  });
});
