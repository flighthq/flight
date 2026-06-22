import { applyGrayscaleEffectToCanvas, defaultCanvasGrayscaleEffectRunner } from './canvasGrayscaleEffect';

describe('applyGrayscaleEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyGrayscaleEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasGrayscaleEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasGrayscaleEffectRunner).toBe('function');
  });
});
