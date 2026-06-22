import { applyMotionBlurEffectToCanvas, defaultCanvasMotionBlurEffectRunner } from './canvasMotionBlurEffect';

describe('applyMotionBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyMotionBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasMotionBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasMotionBlurEffectRunner).toBe('function');
  });
});
