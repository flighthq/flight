import { applyDisplacementEffectToCanvas, defaultCanvasDisplacementEffectRunner } from './canvasDisplacementEffect';

describe('applyDisplacementEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDisplacementEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasDisplacementEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDisplacementEffectRunner).toBe('function');
  });
});
