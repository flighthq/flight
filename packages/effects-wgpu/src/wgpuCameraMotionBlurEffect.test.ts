import {
  applyCameraMotionBlurEffectToWgpu,
  wgpuCameraMotionBlurEffectRunner,
  registerWgpuCameraMotionBlurEffect,
} from './wgpuCameraMotionBlurEffect';

describe('applyCameraMotionBlurEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuCameraMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuCameraMotionBlurEffect).toBeTypeOf('function');
  });
});

describe('wgpuCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuCameraMotionBlurEffectRunner).toBe('function');
  });
});
