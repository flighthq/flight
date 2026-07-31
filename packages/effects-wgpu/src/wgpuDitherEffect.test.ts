import { applyDitherEffectToWgpu, defaultWgpuDitherEffectRunner, registerWgpuDitherEffect } from './wgpuDitherEffect';

describe('applyDitherEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDitherEffectRunner).toBe('function');
  });
});

describe('registerWgpuDitherEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDitherEffect).toBeTypeOf('function');
  });
});
