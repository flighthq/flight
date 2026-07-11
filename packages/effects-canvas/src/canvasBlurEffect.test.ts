import { applyBlurEffectToCanvas, defaultCanvasBlurEffectRunner } from './canvasBlurEffect';

describe('applyBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBlurEffectRunner).toBe('function');
  });
});
