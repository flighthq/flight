import { applyBevelEffectToWgpu, defaultWgpuBevelEffectRunner, registerWgpuBevelEffect } from './wgpuBevelEffect';

describe('applyBevelEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBevelEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBevelEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBevelEffectRunner).toBe('function');
  });
});

describe('registerWgpuBevelEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuBevelEffect).toBeTypeOf('function');
  });
});
