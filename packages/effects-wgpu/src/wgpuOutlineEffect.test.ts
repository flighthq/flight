import {
  applyOutlineEffectToWgpu,
  defaultWgpuOutlineEffectRunner,
  registerWgpuOutlineEffect,
} from './wgpuOutlineEffect';

describe('applyOutlineEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuOutlineEffectRunner).toBe('function');
  });
});

describe('registerWgpuOutlineEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuOutlineEffect).toBeTypeOf('function');
  });
});
