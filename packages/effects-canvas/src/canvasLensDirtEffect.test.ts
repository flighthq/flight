import { applyLensDirtEffectToCanvas, defaultCanvasLensDirtEffectRunner } from './canvasLensDirtEffect';

describe('applyLensDirtEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyLensDirtEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasLensDirtEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasLensDirtEffectRunner).toBe('function');
  });
});
