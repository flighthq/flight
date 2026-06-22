import {
  applyCameraMotionBlurEffectToWgpu,
  defaultWgpuCameraMotionBlurEffectRunner,
} from './wgpuCameraMotionBlurEffect';

describe('applyCameraMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuCameraMotionBlurEffectRunner).toBe('function');
  });
});
