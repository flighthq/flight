import { applyGlitchEffectToCanvas, defaultCanvasGlitchEffectRunner } from './canvasGlitchEffect';

describe('applyGlitchEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyGlitchEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasGlitchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasGlitchEffectRunner).toBe('function');
  });
});
