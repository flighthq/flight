import { applySsaoEffectToCanvas, defaultCanvasSsaoEffectRunner } from './canvasSsaoEffect';

describe('applySsaoEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSsaoEffectRunner).toBe('function');
  });
});
