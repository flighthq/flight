import {
  applyScanlinesEffectToCanvas,
  canvasScanlinesEffectRunner,
  registerCanvasScanlinesEffect,
} from './canvasScanlinesEffect';

describe('applyScanlinesEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyScanlinesEffectToCanvas).toBe('function');
  });
});

describe('canvasScanlinesEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasScanlinesEffectRunner).toBe('function');
  });
});

describe('registerCanvasScanlinesEffect', () => {
  it('is a function', () => expect(registerCanvasScanlinesEffect).toBeTypeOf('function'));
});
