import { applyOuterGlowEffectToCanvas, defaultCanvasOuterGlowEffectRunner } from './canvasOuterGlowEffect';

describe('applyOuterGlowEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasOuterGlowEffectRunner).toBe('function');
  });
});
