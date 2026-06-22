import { applyExposureEffectToCanvas, defaultCanvasExposureEffectRunner } from './canvasExposureEffect';

describe('applyExposureEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasExposureEffectRunner).toBe('function');
  });
});
