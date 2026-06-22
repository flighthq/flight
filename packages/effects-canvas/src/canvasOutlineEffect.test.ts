import { applyOutlineEffectToCanvas, defaultCanvasOutlineEffectRunner } from './canvasOutlineEffect';

describe('applyOutlineEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyOutlineEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasOutlineEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasOutlineEffectRunner).toBe('function');
  });
});
