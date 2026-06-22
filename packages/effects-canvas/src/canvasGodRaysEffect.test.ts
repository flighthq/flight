import { applyGodRaysEffectToCanvas, defaultCanvasGodRaysEffectRunner } from './canvasGodRaysEffect';

describe('applyGodRaysEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasGodRaysEffectRunner).toBe('function');
  });
});
