import { applyPixelateEffectToCanvas, defaultCanvasPixelateEffectRunner } from './canvasPixelateEffect';

describe('applyPixelateEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasPixelateEffectRunner).toBe('function');
  });
});
