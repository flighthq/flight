import { applySsaoEffectToWgpu, wgpuSsaoEffectRunner, registerWgpuSsaoEffect } from './wgpuSsaoEffect.ts';

describe('applySsaoEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuSsaoEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSsaoEffect).toBeTypeOf('function');
  });
});

describe('wgpuSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuSsaoEffectRunner).toBe('function');
  });
});
