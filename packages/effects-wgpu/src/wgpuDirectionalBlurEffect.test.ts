import {
  applyDirectionalBlurEffectToWgpu,
  defaultWgpuDirectionalBlurEffectRunner,
  registerWgpuDirectionalBlurEffect,
} from './wgpuDirectionalBlurEffect';

describe('applyDirectionalBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDirectionalBlurEffectRunner).toBe('function');
  });
});

describe('registerWgpuDirectionalBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuDirectionalBlurEffect).toBeTypeOf('function');
  });
});
