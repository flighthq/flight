import { applyScanlinesEffectToCanvas, defaultCanvasScanlinesEffectRunner } from './canvasScanlinesEffect';

describe('applyScanlinesEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasScanlinesEffectRunner).toBe('function');
  });
});
