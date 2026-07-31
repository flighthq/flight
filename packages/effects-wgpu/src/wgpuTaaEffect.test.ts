import { applyTaaEffectToWgpu, defaultWgpuTaaEffectRunner, registerWgpuTaaEffect } from './wgpuTaaEffect';

describe('applyTaaEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuTaaEffectRunner).toBe('function');
  });
});

describe('registerWgpuTaaEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuTaaEffect).toBeTypeOf('function');
  });
});
