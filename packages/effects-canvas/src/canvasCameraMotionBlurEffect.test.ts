import {
  applyCameraMotionBlurEffectToCanvas,
  defaultCanvasCameraMotionBlurEffectRunner,
} from './canvasCameraMotionBlurEffect';

describe('applyCameraMotionBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyCameraMotionBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasCameraMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasCameraMotionBlurEffectRunner).toBe('function');
  });
});
