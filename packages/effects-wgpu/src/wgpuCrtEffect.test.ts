import { applyCrtEffectToWgpu, wgpuCrtEffectRunner, registerWgpuCrtEffect } from './wgpuCrtEffect.ts';

describe('applyCrtEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuCrtEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuCrtEffect).toBeTypeOf('function');
  });
});

describe('wgpuCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuCrtEffectRunner).toBe('function');
  });
});
