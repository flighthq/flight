import { applyWhiteBalanceEffectToCanvas, defaultCanvasWhiteBalanceEffectRunner } from './canvasWhiteBalanceEffect';

describe('applyWhiteBalanceEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyWhiteBalanceEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasWhiteBalanceEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasWhiteBalanceEffectRunner).toBe('function');
  });
});
