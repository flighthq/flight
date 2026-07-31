import {
  applyMotionBlurEffectToWgpu,
  defaultWgpuMotionBlurEffectRunner,
  registerWgpuMotionBlurEffect,
} from './wgpuMotionBlurEffect';

describe('applyMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerWgpuMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuMotionBlurEffect).toBeTypeOf('function');
  });
});
