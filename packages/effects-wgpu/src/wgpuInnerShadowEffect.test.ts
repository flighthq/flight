import { applyInnerShadowEffectToWgpu, defaultWgpuInnerShadowEffectRunner } from './wgpuInnerShadowEffect';

describe('applyInnerShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyInnerShadowEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuInnerShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuInnerShadowEffectRunner).toBe('function');
  });
});
