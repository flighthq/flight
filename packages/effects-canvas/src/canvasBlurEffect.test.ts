import { applyBlurEffectToCanvas, defaultCanvasBlurEffectRunner, registerCanvasBlurEffect } from './canvasBlurEffect';
import { createCanvasRenderState } from './canvasEffectTestSupport';
import { getCanvasRenderEffectRunner } from './canvasRenderEffectRegistry';

describe('applyBlurEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBlurEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBlurEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBlurEffectRunner).toBe('function');
  });
});

describe('registerCanvasBlurEffect', () => {
  it('registers the default runner under the BlurEffect kind', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasBlurEffect(state);
    expect(getCanvasRenderEffectRunner(state, 'BlurEffect')).toBe(defaultCanvasBlurEffectRunner);
  });
});
