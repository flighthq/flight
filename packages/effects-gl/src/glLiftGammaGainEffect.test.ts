import { applyLiftGammaGainEffectToGl, defaultGlLiftGammaGainEffectRunner } from './glLiftGammaGainEffect';

describe('applyLiftGammaGainEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyLiftGammaGainEffectToGl).toBe('function');
  });
});

describe('defaultGlLiftGammaGainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlLiftGammaGainEffectRunner).toBe('function');
  });
});
