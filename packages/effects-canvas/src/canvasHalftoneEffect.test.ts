import { applyHalftoneEffectToCanvas, defaultCanvasHalftoneEffectRunner } from './canvasHalftoneEffect';

describe('applyHalftoneEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyHalftoneEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasHalftoneEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasHalftoneEffectRunner).toBe('function');
  });
});
