import {
  applyScanlinesEffectToCanvas,
  defaultCanvasScanlinesEffectRunner,
  registerCanvasScanlinesEffect,
} from './canvasScanlinesEffect';

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

describe('registerCanvasScanlinesEffect', () => {
  it('is a function', () => expect(registerCanvasScanlinesEffect).toBeTypeOf('function'));
});
