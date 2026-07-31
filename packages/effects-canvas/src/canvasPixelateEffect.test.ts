import {
  applyPixelateEffectToCanvas,
  defaultCanvasPixelateEffectRunner,
  registerCanvasPixelateEffect,
} from './canvasPixelateEffect';

describe('applyPixelateEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyPixelateEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasPixelateEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasPixelateEffectRunner).toBe('function');
  });
});

describe('registerCanvasPixelateEffect', () => {
  it('is a function', () => expect(registerCanvasPixelateEffect).toBeTypeOf('function'));
});
