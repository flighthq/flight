import { applySsrEffectToCanvas, defaultCanvasSsrEffectRunner } from './canvasSsrEffect';

describe('applySsrEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSsrEffectRunner).toBe('function');
  });
});
