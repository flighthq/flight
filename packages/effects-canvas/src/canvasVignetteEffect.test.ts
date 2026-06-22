import { applyVignetteEffectToCanvas, defaultCanvasVignetteEffectRunner } from './canvasVignetteEffect';

describe('applyVignetteEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasVignetteEffectRunner).toBe('function');
  });
});
