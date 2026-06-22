import { applyBloomEffectToCanvas, defaultCanvasBloomEffectRunner } from './canvasBloomEffect';

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
