import { applyFxaaEffectToCanvas, defaultCanvasFxaaEffectRunner } from './canvasFxaaEffect';

describe('applyFxaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasFxaaEffectRunner).toBe('function');
  });
});
