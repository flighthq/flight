import { applyLensFlareEffectToCanvas, defaultCanvasLensFlareEffectRunner } from './canvasLensFlareEffect';

describe('applyLensFlareEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasLensFlareEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasLensFlareEffectRunner).toBe('function');
  });
});
