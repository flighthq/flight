import {
  applyMotionBlurEffectToWgpu,
  wgpuMotionBlurEffectRunner,
  registerWgpuMotionBlurEffect,
} from './wgpuMotionBlurEffect.ts';

describe('applyMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuMotionBlurEffect).toBeTypeOf('function');
  });
});

describe('wgpuMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuMotionBlurEffectRunner).toBe('function');
  });
});
