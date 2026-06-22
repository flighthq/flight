import { applyVignetteEffectToWgpu, defaultWgpuVignetteEffectRunner } from './wgpuVignetteEffect';

describe('applyVignetteEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyVignetteEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuVignetteEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuVignetteEffectRunner).toBe('function');
  });
});
