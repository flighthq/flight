import { applyBlurEffectToCanvas, canvasBlurEffectRunner, registerCanvasBlurEffect } from './canvasBlurEffect';
import { getCanvasEffectRunner } from './canvasEffectRegistry';
import { createCanvasRenderState } from './canvasEffectTestSupport';

describe('applyBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToCanvas).toBe('function');
  });
});

describe('canvasBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof canvasBlurEffectRunner).toBe('function');
  });
});

describe('registerCanvasBlurEffect', () => {
  it('registers the default runner under the BlurEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlurEffect(state);
    expect(getCanvasEffectRunner(state, 'BlurEffect')).toBe(canvasBlurEffectRunner);
  });
});
