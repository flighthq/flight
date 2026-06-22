import { applyTaaEffectToCanvas, defaultCanvasTaaEffectRunner } from './canvasTaaEffect';

describe('applyTaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasTaaEffectRunner).toBe('function');
  });
});
