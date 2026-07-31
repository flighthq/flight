import {
  applyLensFlareEffectToWgpu,
  defaultWgpuLensFlareEffectRunner,
  registerWgpuLensFlareEffect,
} from './wgpuLensFlareEffect';

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

describe('registerWgpuLensFlareEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuLensFlareEffect).toBeTypeOf('function');
  });
});
