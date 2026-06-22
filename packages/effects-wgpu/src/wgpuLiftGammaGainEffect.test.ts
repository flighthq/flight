import { applyLiftGammaGainEffectToWgpu, defaultWgpuLiftGammaGainEffectRunner } from './wgpuLiftGammaGainEffect';

describe('applyLiftGammaGainEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLiftGammaGainEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLiftGammaGainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLiftGammaGainEffectRunner).toBe('function');
  });
});
