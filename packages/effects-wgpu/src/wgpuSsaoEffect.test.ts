import { applySsaoEffectToWgpu, defaultWgpuSsaoEffectRunner, registerWgpuSsaoEffect } from './wgpuSsaoEffect';

describe('applySsaoEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsaoEffectRunner).toBe('function');
  });
});

describe('registerWgpuSsaoEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSsaoEffect).toBeTypeOf('function');
  });
});
