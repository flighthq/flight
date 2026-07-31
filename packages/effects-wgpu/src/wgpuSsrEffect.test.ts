import { applySsrEffectToWgpu, defaultWgpuSsrEffectRunner, registerWgpuSsrEffect } from './wgpuSsrEffect';

describe('applySsrEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuSsrEffectRunner).toBe('function');
  });
});

describe('registerWgpuSsrEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSsrEffect).toBeTypeOf('function');
  });
});
