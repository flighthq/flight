import { applyDropShadowEffectToCanvas, defaultCanvasDropShadowEffectRunner } from './canvasDropShadowEffect';

describe('applyDropShadowEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDropShadowEffectRunner).toBe('function');
  });
});
