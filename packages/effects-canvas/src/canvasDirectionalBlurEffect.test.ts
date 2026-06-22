import {
  applyDirectionalBlurEffectToCanvas,
  defaultCanvasDirectionalBlurEffectRunner,
} from './canvasDirectionalBlurEffect';

describe('applyDirectionalBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDirectionalBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasDirectionalBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDirectionalBlurEffectRunner).toBe('function');
  });
});
