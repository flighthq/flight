import { getCanvasRenderEffectRunner, registerCanvasRenderEffect } from './canvasRenderEffectRegistry';

describe('getCanvasRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getCanvasRenderEffectRunner).toBe('function');
  });
});

describe('registerCanvasRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerCanvasRenderEffect).toBe('function');
  });
});
