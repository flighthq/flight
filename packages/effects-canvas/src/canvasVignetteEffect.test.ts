import {
  applyVignetteEffectToCanvas,
  canvasVignetteEffectRunner,
  registerCanvasVignetteEffect,
} from './canvasVignetteEffect';

describe('applyVignetteEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToCanvas).toBe('function');
  });
});

describe('canvasVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasVignetteEffectRunner).toBe('function');
  });
});

describe('registerCanvasVignetteEffect', () => {
  it('is a function', () => expect(registerCanvasVignetteEffect).toBeTypeOf('function'));
});
