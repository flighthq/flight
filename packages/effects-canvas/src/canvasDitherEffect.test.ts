import { applyDitherEffectToCanvas, defaultCanvasDitherEffectRunner } from './canvasDitherEffect';

describe('applyDitherEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasDitherEffectRunner).toBe('function');
  });
});
