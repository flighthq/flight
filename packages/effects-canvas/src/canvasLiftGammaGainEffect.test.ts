import { applyLiftGammaGainEffectToCanvas, defaultCanvasLiftGammaGainEffectRunner } from './canvasLiftGammaGainEffect';

describe('applyLiftGammaGainEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyLiftGammaGainEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasLiftGammaGainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasLiftGammaGainEffectRunner).toBe('function');
  });
});
