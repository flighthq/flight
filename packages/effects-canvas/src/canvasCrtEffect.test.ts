import { applyCrtEffectToCanvas, defaultCanvasCrtEffectRunner } from './canvasCrtEffect';

describe('applyCrtEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyCrtEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasCrtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasCrtEffectRunner).toBe('function');
  });
});
