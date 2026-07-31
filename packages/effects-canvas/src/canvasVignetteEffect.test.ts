import {
  applyVignetteEffectToCanvas,
  defaultCanvasVignetteEffectRunner,
  registerCanvasVignetteEffect,
} from './canvasVignetteEffect';

describe('applyVignetteEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasVignetteEffectRunner).toBe('function');
  });
});

describe('registerCanvasVignetteEffect', () => {
  it('is a function', () => expect(registerCanvasVignetteEffect).toBeTypeOf('function'));
});
