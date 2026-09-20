import { applySmaaEffectToWgpu, wgpuSmaaEffectRunner, registerWgpuSmaaEffect } from './wgpuSmaaEffect';

describe('applySmaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuSmaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSmaaEffect).toBeTypeOf('function');
  });
});

describe('wgpuSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuSmaaEffectRunner).toBe('function');
  });
});
