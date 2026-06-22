import { applyHueSaturationEffectToCanvas, defaultCanvasHueSaturationEffectRunner } from './canvasHueSaturationEffect';

describe('applyHueSaturationEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyHueSaturationEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasHueSaturationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasHueSaturationEffectRunner).toBe('function');
  });
});
