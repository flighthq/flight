import { applyOuterGlowEffectToWgpu, defaultWgpuOuterGlowEffectRunner } from './wgpuOuterGlowEffect';

describe('applyOuterGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyOuterGlowEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuOuterGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuOuterGlowEffectRunner).toBe('function');
  });
});
