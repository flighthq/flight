import { applyLensFlareEffectToWgpu, defaultWgpuLensFlareEffectRunner } from './wgpuLensFlareEffect';

describe('applyLensFlareEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLensFlareEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLensFlareEffectRunner).toBe('function');
  });
});
