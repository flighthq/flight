import {
  applyCameraMotionBlurEffectToGl,
  glCameraMotionBlurEffectRunner,
  registerGlCameraMotionBlurEffect,
} from './glCameraMotionBlurEffect';

describe('applyCameraMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToGl).toBe('function');
  });
});

describe('glCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof glCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerGlCameraMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlCameraMotionBlurEffect).toBeTypeOf('function');
  });
});
