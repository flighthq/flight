import {
  applyBloomEffectToCanvas,
  defaultCanvasBloomEffectRunner,
  registerCanvasBloomEffect,
} from './canvasBloomEffect';

describe('applyBloomEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBloomEffectRunner).toBe('function');
  });
});

describe('registerCanvasBloomEffect', () => {
  it('is a function', () => expect(registerCanvasBloomEffect).toBeTypeOf('function'));
});
