import { applyDitherEffectToWgpu, wgpuDitherEffectRunner, registerWgpuDitherEffect } from './wgpuDitherEffect.ts';

describe('applyDitherEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuDitherEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDitherEffect).toBeTypeOf('function');
  });
});

describe('wgpuDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuDitherEffectRunner).toBe('function');
  });
});
