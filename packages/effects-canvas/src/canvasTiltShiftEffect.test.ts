import { applyTiltShiftEffectToCanvas, defaultCanvasTiltShiftEffectRunner } from './canvasTiltShiftEffect';

describe('applyTiltShiftEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyTiltShiftEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasTiltShiftEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasTiltShiftEffectRunner).toBe('function');
  });
});
