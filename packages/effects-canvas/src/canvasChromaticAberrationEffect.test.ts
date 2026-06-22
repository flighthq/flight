import {
  applyChromaticAberrationEffectToCanvas,
  defaultCanvasChromaticAberrationEffectRunner,
} from './canvasChromaticAberrationEffect';

describe('applyChromaticAberrationEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasChromaticAberrationEffectRunner).toBe('function');
  });
});
