import {
  applyDirectionalBlurEffectToWgpu,
  wgpuDirectionalBlurEffectRunner,
  registerWgpuDirectionalBlurEffect,
} from './wgpuDirectionalBlurEffect.ts';

describe('applyDirectionalBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuDirectionalBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDirectionalBlurEffect).toBeTypeOf('function');
  });
});

describe('wgpuDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuDirectionalBlurEffectRunner).toBe('function');
  });
});
