import {
  applyPixelateEffectToCanvas,
  canvasPixelateEffectRunner,
  registerCanvasPixelateEffect,
} from './canvasPixelateEffect';

describe('applyPixelateEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToCanvas).toBe('function');
  });
});

describe('canvasPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasPixelateEffectRunner).toBe('function');
  });
});

describe('registerCanvasPixelateEffect', () => {
  it('is a function', () => expect(registerCanvasPixelateEffect).toBeTypeOf('function'));
});
