import { applyRadialBlurEffectToCanvas, defaultCanvasRadialBlurEffectRunner } from './canvasRadialBlurEffect';

describe('applyRadialBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyRadialBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasRadialBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasRadialBlurEffectRunner).toBe('function');
  });
});
