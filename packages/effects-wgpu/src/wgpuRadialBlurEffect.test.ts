import {
  applyRadialBlurEffectToWgpu,
  defaultWgpuRadialBlurEffectRunner,
  registerWgpuRadialBlurEffect,
} from './wgpuRadialBlurEffect';

describe('applyRadialBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuRadialBlurEffectRunner).toBe('function');
  });
});

describe('registerWgpuRadialBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuRadialBlurEffect).toBeTypeOf('function');
  });
});
