import { applyInvertEffectToCanvas, defaultCanvasInvertEffectRunner } from './canvasInvertEffect';

describe('applyInvertEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyInvertEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasInvertEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasInvertEffectRunner).toBe('function');
  });
});
