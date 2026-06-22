import { applyCameraMotionBlurEffectToGl, defaultGlCameraMotionBlurEffectRunner } from './glCameraMotionBlurEffect';

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
