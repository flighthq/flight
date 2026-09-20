import {
  applyLensDistortionEffectToWgpu,
  wgpuLensDistortionEffectRunner,
  registerWgpuLensDistortionEffect,
} from './wgpuLensDistortionEffect';

describe('applyLensDistortionEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensDistortionEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuLensDistortionEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensDistortionEffect).toBeTypeOf('function');
  });
});

describe('wgpuLensDistortionEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuLensDistortionEffectRunner).toBe('function');
  });
});
