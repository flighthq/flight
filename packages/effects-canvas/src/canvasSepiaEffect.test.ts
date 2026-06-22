import { applySepiaEffectToCanvas, defaultCanvasSepiaEffectRunner } from './canvasSepiaEffect';

describe('applySepiaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySepiaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSepiaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSepiaEffectRunner).toBe('function');
  });
});
