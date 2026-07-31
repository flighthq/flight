import {
  applyCameraMotionBlurEffectToWgpu,
  defaultWgpuCameraMotionBlurEffectRunner,
  registerWgpuCameraMotionBlurEffect,
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

describe('registerWgpuCameraMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuCameraMotionBlurEffect).toBeTypeOf('function');
  });
});
