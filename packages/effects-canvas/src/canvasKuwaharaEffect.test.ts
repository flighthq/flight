import { applyKuwaharaEffectToCanvas, defaultCanvasKuwaharaEffectRunner } from './canvasKuwaharaEffect';

describe('applyKuwaharaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyKuwaharaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasKuwaharaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasKuwaharaEffectRunner).toBe('function');
  });
});
