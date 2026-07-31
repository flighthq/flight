import {
  applyLensDistortionEffectToWgpu,
  defaultWgpuLensDistortionEffectRunner,
  registerWgpuLensDistortionEffect,
} from './wgpuLensDistortionEffect';

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

describe('registerWgpuLensDistortionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensDistortionEffect).toBeTypeOf('function');
  });
});
