import {
  applyCameraMotionBlurEffectToGl,
  defaultGlCameraMotionBlurEffectRunner,
  registerGlCameraMotionBlurEffect,
} from './glCameraMotionBlurEffect';

describe('applyCameraMotionBlurEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToGl).toBe('function');
  });
});

describe('defaultGlCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlCameraMotionBlurEffectRunner).toBe('function');
  });
});

describe('registerGlCameraMotionBlurEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlCameraMotionBlurEffect).toBeTypeOf('function');
  });
});
