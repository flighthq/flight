import { applyExposureEffectToWgpu, defaultWgpuExposureEffectRunner } from './wgpuExposureEffect';

describe('applyExposureEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuExposureEffectRunner).toBe('function');
  });
});
