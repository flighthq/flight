import { applyToneMapEffectToCanvas, defaultCanvasToneMapEffectRunner } from './canvasToneMapEffect';

describe('applyToneMapEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasToneMapEffectRunner).toBe('function');
  });
});
