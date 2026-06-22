import { applySmaaEffectToCanvas, defaultCanvasSmaaEffectRunner } from './canvasSmaaEffect';

describe('applySmaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSmaaEffectRunner).toBe('function');
  });
});
