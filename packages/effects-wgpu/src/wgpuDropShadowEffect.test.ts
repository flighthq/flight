import { applyDropShadowEffectToWgpu, defaultWgpuDropShadowEffectRunner } from './wgpuDropShadowEffect';

describe('applyDropShadowEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDropShadowEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDropShadowEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDropShadowEffectRunner).toBe('function');
  });
});
