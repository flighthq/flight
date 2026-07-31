import { applyCrtEffectToWgpu, defaultWgpuCrtEffectRunner, registerWgpuCrtEffect } from './wgpuCrtEffect';

describe('applyCrtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuCrtEffectRunner).toBe('function');
  });
});

describe('registerWgpuCrtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuCrtEffect).toBeTypeOf('function');
  });
});
