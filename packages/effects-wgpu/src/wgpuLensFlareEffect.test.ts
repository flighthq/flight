import {
  applyLensFlareEffectToWgpu,
  wgpuLensFlareEffectRunner,
  registerWgpuLensFlareEffect,
} from './wgpuLensFlareEffect.ts';

describe('applyLensFlareEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLensFlareEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuLensFlareEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensFlareEffect).toBeTypeOf('function');
  });
});

describe('wgpuLensFlareEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuLensFlareEffectRunner).toBe('function');
  });
});
