import { applySharpenEffectToWgpu, wgpuSharpenEffectRunner, registerWgpuSharpenEffect } from './wgpuSharpenEffect.ts';

describe('applySharpenEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuSharpenEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuSharpenEffect).toBeTypeOf('function');
  });
});

describe('wgpuSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuSharpenEffectRunner).toBe('function');
  });
});
