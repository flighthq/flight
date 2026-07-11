import { applyInnerGlowEffectToWgpu, defaultWgpuInnerGlowEffectRunner } from './wgpuInnerGlowEffect';

describe('applyInnerGlowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInnerGlowEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuInnerGlowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInnerGlowEffectRunner).toBe('function');
  });
});
