import { applySharpenEffectToCanvas, defaultCanvasSharpenEffectRunner } from './canvasSharpenEffect';

describe('applySharpenEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySharpenEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSharpenEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSharpenEffectRunner).toBe('function');
  });
});
