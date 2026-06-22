import { applyMotionBlurEffectToWgpu, defaultWgpuMotionBlurEffectRunner } from './wgpuMotionBlurEffect';

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
