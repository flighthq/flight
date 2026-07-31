import { applySmaaEffectToWgpu, defaultWgpuSmaaEffectRunner, registerWgpuSmaaEffect } from './wgpuSmaaEffect';

describe('applySmaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSmaaEffectRunner).toBe('function');
  });
});

describe('registerWgpuSmaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSmaaEffect).toBeTypeOf('function');
  });
});
