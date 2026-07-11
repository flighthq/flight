import { applyMedianEffectToCanvas, defaultCanvasMedianEffectRunner } from './canvasMedianEffect';

describe('applyMedianEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyMedianEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasMedianEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasMedianEffectRunner).toBe('function');
  });
});
