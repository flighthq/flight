import { applyLensDistortionEffectToWgpu, defaultWgpuLensDistortionEffectRunner } from './wgpuLensDistortionEffect';

describe('applyLensDistortionEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensDistortionEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLensDistortionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLensDistortionEffectRunner).toBe('function');
  });
});
