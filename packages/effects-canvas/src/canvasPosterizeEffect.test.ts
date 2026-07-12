import { applyPosterizeEffectToCanvas, defaultCanvasPosterizeEffectRunner } from './canvasPosterizeEffect';

describe('applyPosterizeEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyPosterizeEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasPosterizeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasPosterizeEffectRunner).toBe('function');
  });
});
